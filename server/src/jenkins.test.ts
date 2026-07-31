import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildJenkinsAutomationPayload,
  formatJenkinsDuration,
  normalizeJenkinsStatus,
} from "./jenkins.js";

describe("Jenkins integration helpers", () => {
  it("normalizes Jenkins results to Echo automation statuses", () => {
    assert.equal(normalizeJenkinsStatus("SUCCESS"), "success");
    assert.equal(normalizeJenkinsStatus("FAILURE"), "failed");
    assert.equal(normalizeJenkinsStatus("UNSTABLE"), "warning");
    assert.equal(normalizeJenkinsStatus("ABORTED"), "cancelled");
    assert.equal(normalizeJenkinsStatus("NOT_EXECUTED"), "skipped");
    assert.equal(normalizeJenkinsStatus("IN_PROGRESS"), "running");
  });

  it("formats millisecond durations for people", () => {
    assert.equal(formatJenkinsDuration(420), "420ms");
    assert.equal(formatJenkinsDuration(1250), "1.3s");
    assert.equal(formatJenkinsDuration(125000), "2m 5s");
    assert.equal(formatJenkinsDuration(3_725_000), "1h 2m 5s");
  });

  it("renders the wfapi pipeline graph and identifies failed stages", () => {
    const payload = buildJenkinsAutomationPayload({
      jobName: "payments/main",
      buildNumber: "42",
      buildUrl: "http://jenkins.example/job/payments/42/",
      status: "FAILURE",
      durationMillis: 128000,
      branchName: "main",
      gitCommit: "abcdef1234567890",
      relevantPerson: "@ariel",
      pipeline: {
        status: "IN_PROGRESS",
        queueDurationMillis: 3200,
        stages: [
          { name: "Checkout", status: "SUCCESS", durationMillis: 1000 },
          {
            name: "Tests",
            status: "FAILURE",
            durationMillis: 120000,
            parallelGroup: "Test matrix",
            stageFlowNodes: [
              { name: "JUnit", status: "SUCCESS", durationMillis: 80000 },
              {
                name: "Shell Script",
                status: "FAILED",
                durationMillis: 40000,
                error: { message: "script returned exit code 1" },
              },
            ],
          },
          { name: "Deploy", status: "NOT_EXECUTED", durationMillis: 0 },
        ],
      },
    });

    assert.equal(payload.status, "failed");
    assert.equal(payload.title, "payments/main #42");
    assert.equal(payload.externalKey, "jenkins:payments/main:42");
    assert.match(payload.body, /Open build in Jenkins/);
    assert.doesNotMatch(payload.body, /Pipeline stages/);
    assert.deepEqual(payload.report.failedStages, ["Tests"]);
    assert.equal(payload.report.nodeCount, 2);
    assert.equal(payload.report.failedNodeCount, 1);
    assert.equal(payload.jenkins.jobName, "payments/main");
    assert.equal(payload.jenkins.relevantPerson, "ariel");
    assert.deepEqual(payload.fields, [
      { name: "Branch", value: "main" },
      { name: "Failed stage", value: "Tests" },
      { name: "Relevant person", value: "@ariel" },
    ]);
    assert.equal(payload.jenkins.stages[1].parallelGroup, "Test matrix");
    assert.equal(payload.jenkins.stages[1].nodes[1].errorMessage, "script returned exit code 1");
  });

  it("rejects non-http build links from rendered markdown", () => {
    const payload = buildJenkinsAutomationPayload({
      jobName: "unsafe",
      buildNumber: 1,
      buildUrl: "javascript:alert(1)",
      pipeline: { stages: [] },
    });
    assert.doesNotMatch(payload.body, /javascript:/);
  });

  it("accepts only safe Echo mention handles for the relevant person", () => {
    const safe = buildJenkinsAutomationPayload({
      jobName: "safe",
      buildNumber: 1,
      notify: "maya-dev",
      pipeline: { stages: [] },
    });
    const unsafe = buildJenkinsAutomationPayload({
      jobName: "unsafe",
      buildNumber: 2,
      notify: "Maya Dev @everyone",
      pipeline: { stages: [] },
    });

    assert.equal(safe.jenkins.relevantPerson, "maya-dev");
    assert.equal(unsafe.jenkins.relevantPerson, "");
  });

  it("keeps large pipeline reports within Echo's message limit", () => {
    const payload = buildJenkinsAutomationPayload({
      jobName: "large-pipeline",
      buildNumber: 99,
      status: "FAILURE",
      errorMessage: "x".repeat(1000),
      triggeredBy: "automation".repeat(30),
      pipeline: {
        stages: Array.from({ length: 200 }, (_, index) => ({
          name: `A long pipeline stage name ${index}`,
          status: index === 199 ? "FAILURE" : "SUCCESS",
          durationMillis: index * 1000,
        })),
      },
    });

    assert.ok(payload.body.length < 500);
    assert.deepEqual(
      payload.fields.find((field) => field.name === "Failed stage"),
      { name: "Failed stage", value: "A long pipeline stage name 199" }
    );
  });
});
