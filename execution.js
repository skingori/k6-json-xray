import http from "k6/http";
import moment from "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js";

import { jira_url, jira_token } from "../prop.js";
/**
 * The reson to use  k6 http is to ensure that
 * we don't rely alot on node modules since k6 doesn't have a node modules support
 * https://k6.io/docs/using-k6/modules/
 **/

function getJiraToken() {
  return jira_token;
}

let JIRA_ENDPOINT = jira_url;

function getHeaders() {
  return {
    Authorization: `Basic ${getJiraToken()}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

function getDate() {
  const date = new Date();
  return moment(date).format("DD-MM-YYYY");
}

const summary = `Daily release Test Plan ${getDate()}`;

function createTestPlan() {
  const bodyData = `{"fields":{"project":{"key": "QA"},"summary": "${summary}","issuetype":{"name":"Test Plan"},"labels": ["nightly"]}}`;
  try {
    let response = http.post(`${JIRA_ENDPOINT}/rest/api/3/issue`, bodyData, {
      headers: getHeaders(),
      timeout: 300000
    });
    return { data: response.json() };
  } catch (e) {
    console.log(e);
    return false;
  }
}

// This is used to get the test-plan created by the API
function getTestPlan() {
  const bodyData = `{"jql":"project = QA AND summary~'${summary}' AND type='Test Plan' AND creator='5ef36c793b58690ab9c26171' ORDER BY created DESC","startAt":0,"maxResults":1,"fields":["id","key"]}`;
  try {
    const response = http.post(`${JIRA_ENDPOINT}/rest/api/3/search`, bodyData, {
      headers: getHeaders(),
      timeout: 300000
    });
    return { data: response.json() };
  } catch (e) {
    console.log(e);
    return false;
  }
}

function setToEnvironment(key) {
  __ENV.TEST_PLAN_KEY = key;
  return key;
}

function assignTestPlan() {
  try {
    let { data } = getTestPlan();
    if (
      data &&
      typeof data !== "undefined" && data.constructor === Object &&
      Object.keys(data).length !== 0 &&
      data.total !== 0
    ) {
      let { issues } = data;
      let key = getKey(issues, "key");
      console.log(
        "=============================================================="
      );
      console.log(`Test Plan ${key} exists, let's use it!`);
      console.log(
        "=============================================================="
      );
      console.log(`Test Plan ${key} assigned to environment`);
      return setToEnvironment(key);
    } else {
      let { data } = createTestPlan();
      if (data && typeof data !== "undefined" && data.constructor === Object) {
        let { key } = data;
        console.log(
          "=============================================================="
        );
        console.log(`Test Plan ${key} created, let's use it!`);
        console.log(
          "=============================================================="
        );
        console.log(`Test Plan ${key} assigned to environment`);
        return setToEnvironment(key);
      }
    }
  } catch (e) {
    console.log("We have an error", e);
    return false;
  }
}

export function addTestPlan() {
  try {
    if (__ENV.TEST_PLAN_KEY) {
      console.log(
        "=============================================================="
      );
      console.log(
        `Test Plan ${__ENV.TEST_PLAN_KEY} exists on environment, let's use it!`
      );
      console.log(
        "=============================================================="
      );
      return __ENV.TEST_PLAN_KEY;
    }
    return assignTestPlan();
  } catch (e) {
    console.log("We have an error adding a TP!", e);
    return false;
  }
}

function getKey(array, key) {
  for (let i = 0; i < array.length; i++) {
    return array[i][key];
  }
}
