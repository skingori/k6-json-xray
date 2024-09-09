function getKey(test, testKeyType) {
  const testKey = test.match(new RegExp(`${testKeyType}-\\d+`, "g"));
  if (testKey) {
    return testKey[0];
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
  for (let {
    checks: [...rest]
  } of extractGroups(data["root_group"].groups)) {
    Object.values(rest).forEach((value) => {
      if (parseInt(value.fails) > 0) {
        fails.push(getKey(value.path, testKeyType));
      } else if (
        !value.fails &&
        parseInt(value.fails) === 0 &&
        parseInt(value.passes) > 0
      ) {
        passes.push(getKey(value.path, testKeyType));
      }
    });
    // remove values that failed from passed list
    fails.forEach((key_) => {
      passes = passes.filter((item) => item !== key_);
    });
  }
  // remove duplicates and combine an array of failed and passed tests
  // const pass = passes.length > 0 ? removeDuplicates(passes) : [];
  // const fail = fails.length > 0 ? removeDuplicates(fails) : [];
  return {
    pass: passes.length > 0 ? removeDuplicates(passes) : [],
    fail: fails.length > 0 ? removeDuplicates(fails) : []
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
  let tests = [];
  let { pass, fail } = data;
  if ((pass && pass.length !== 0) || (fail && fail.length !== 0)) {
    const passed = "PASSED";
    const failed = "FAILED";
    Object.values(pass).forEach((value) => {
      tests.push({
        testKey: value,
        start: timeNow,
        finish: timeNow,
        comment: `Test execution ${passed.toLocaleLowerCase()}`,
        status: passed
      });
    });
    Object.values(fail).forEach((value) => {
      tests.push({
        testKey: value,
        start: timeNow,
        finish: timeNow,
        comment: `Test execution ${failed.toLocaleLowerCase()}`,
        status: failed
      });
    });
  }
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
