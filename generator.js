function getKey(test, testKeyType) {
  const testKey = test.match(new RegExp(`${testKeyType}-\\d+`, "g"));
  if (testKey) {
    return testKey ? testKey[0] : null;
  }
}

/*
  A group may have checks, that either fail or pass
  This function checks if a check within a group has passed or failed. If failed.
  Mark the entire group as failed
  This is because a group is considered to have passed if all the checks within it have passed
   */
  function checkMetrics(data, testKeyType) {
    let fails = [];
    let passes = [];
    
    for (let { checks } of extractGroups(data["root_group"].groups)) {
      checks.forEach((value) => {
        const key = getKey(value.path, testKeyType);
        if (parseInt(value.fails) > 0) {
          fails.push(key);
        } else if (parseInt(value.passes) > 0) {
          passes.push(key);
        }
      });
    }
  
    // Remove failed keys from passes
    passes = passes.filter((key) => !fails.includes(key));
  
    return {
      pass: removeDuplicates(passes),
      fail: removeDuplicates(fails)
    };
  }  

function getTime(option, data) {
  if (option === "min") {
    return data.metrics.iteration_duration.values.min
      ? data.metrics.iteration_duration.values.min
      : 0;
  } else {
    return data.metrics.iteration_duration.values.max
      ? data.metrics.iteration_duration.values.max
      : 0;
  }
}

/**
 * @param {string} data
 * @param {string} timeNow
 *
 * Note: This function modifies the data object from k6 to xray format
 *
 */
function modifyTests(data, timeNow) {
  const tests = [];
  const { pass = [], fail = [] } = data;
  const statuses = { pass: "PASSED", fail: "FAILED" };

  const addTests = (keys, status) => {
    keys.forEach((key) => {
      tests.push({
        testKey: key,
        start: timeNow,
        finish: timeNow,
        comment: `Test execution ${status.toLowerCase()}`,
        status: status
      });
    });
  };

  addTests(pass, statuses.pass);
  addTests(fail, statuses.fail);

  return tests;
}

/*
  Each group contains checks, that either fail or pass
   */
function getChecks(data) {
  let checkFailures = 0;
  let checkPasses = 0;
  for (let group of extractGroups(data["root_group"].groups)) {
    if (group.checks) {
      let { passes, fails } = countChecks(group.checks);
      checkFailures += fails;
      checkPasses += passes;
    }
  }

  return { failMetrics: checkFailures, passMetrics: checkPasses };
}

function makeJiraTests(tests, timeNow, min, max, metrics, key) {
  const plan = { info: {} };
  const { passMetrics, failMetrics } = metrics;
  plan.testExecutionKey = __ENV.TEST_EXEC_KEY;
  plan.info.summary = `K6 Test execution - ${timeNow}`;
  plan.info.description = `This is k6 test with maximum iteration duration of ${max}s, ${passMetrics} passed requests and ${failMetrics} failures on checks`;
  plan.info.user = "k6-user";
  plan.info.startDate = timeNow;
  plan.info.finishDate = timeNow;
  plan.info.testPlanKey =
    __ENV.TEST_PLAN_KEY === "undefined" || __ENV.TEST_PLAN_KEY === ""
      ? key
      : __ENV.TEST_PLAN_KEY;
  plan.tests = tests;
  return plan;
}

function removeDuplicates(array) {
  return [...new Set(array)];
}

/**
 * We may have multiple groups in the data, this function extracts the groups
 * @param {object} obj
 */
function extractGroups(obj) {
  const groups = Object.values(obj);
  return groups.reduce((acc, group) => {
    if (group.groups) {
      return [...acc, group, ...extractGroups(group.groups)];
    }
    return [...acc, group];
  }, []);
}

function countChecks(checks) {
  let passes = 0;
  let fails = 0;
  for (let check of checks) {
    passes += parseInt(check.passes);
    fails += parseInt(check.fails);
  }
  return { passes, fails };
}

function getTimeNow() {
  return new Date(new Date().toString());
}

export function getSummary(data, key, testKeyType) {
  let raw = checkMetrics(data, testKeyType);
  let timeNow = getTimeNow();
  let min = getTime("min", data);
  let max = getTime("max", data);
  return makeJiraTests(
    modifyTests(raw, timeNow),
    timeNow,
    min.toFixed(2),
    (max / 1000).toFixed(2),
    getChecks(data),
    key
  );
}
