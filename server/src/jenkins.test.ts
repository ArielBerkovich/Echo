import assert from "node:assert/strict";
import test from "node:test";
import { eventKey, hashJenkinsToken, messageBody, notificationKind, encryptJenkinsToken, decryptJenkinsToken } from "./jenkins.js";

test.describe("Jenkins integration", () => {
  test("classifies common Jenkins build webhook events", () => {
    assert.equal(notificationKind({ build: { building: true, userId: "ariel" } }), "buildStarted");
    assert.equal(notificationKind({ build: { result: "SUCCESS", userId: "ariel" } }), "buildSucceeded");
    assert.equal(notificationKind({ build: { result: "FAILURE", userId: "ariel" } }), "buildFailed");
    assert.equal(notificationKind({ build: { result: "UNSTABLE", userId: "ariel" } }), "buildUnstable");
    assert.equal(notificationKind({ build: { result: "ABORTED", userId: "ariel" } }), "buildAborted");
  });

  test("supports Jenkins causes and renders build links", () => {
    const payload = { name: "simple-demo-job", build: { number: 7, result: "SUCCESS", url: "http://localhost:8080/job/simple-demo-job/7/", causes: [{ userId: "ariel" }] } };
    assert.equal(notificationKind(payload), "buildSucceeded");
    assert.match(messageBody("buildSucceeded", payload), /simple-demo-job/);
    assert.match(messageBody("buildSucceeded", payload), /Open in Jenkins/);
    assert.ok(eventKey(payload, "buildSucceeded"));
  });

  test("creates distinct idempotency keys for native Jenkins webhook builds", () => {
    const first = { event: "success", projectName: "simple-demo-job", buildName: "#11", buildUrl: "http://jenkins/job/simple-demo-job/11/" };
    const second = { event: "success", projectName: "simple-demo-job", buildName: "#12", buildUrl: "http://jenkins/job/simple-demo-job/12/" };
    assert.notEqual(eventKey(first, "buildSucceeded"), eventKey(second, "buildSucceeded"));
    assert.equal(eventKey(first, "buildSucceeded"), eventKey({ ...first }, "buildSucceeded"));
  });

  test("does not expose webhook secrets and round-trips encrypted tokens", () => {
    const token = "jenkins-test-token";
    assert.notEqual(hashJenkinsToken(token), token);
    assert.equal(decryptJenkinsToken(encryptJenkinsToken(token)), token);
  });
});
