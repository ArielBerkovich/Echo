import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptAzureDevOpsToken, encryptAzureDevOpsToken, hashAzureDevOpsToken, messageBody, notificationKind } from "./azureDevOps.js";

describe("Azure DevOps integration", () => {
  it("classifies the supported notification events", () => {
    assert.equal(notificationKind({ eventType: "git.pullrequest.created", resource: {} }), "pullRequestCreated");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", message: { text: "Ariel approved pull request 1" }, resource: { status: "active", reviewers: [{ vote: 10 }] } }), "pullRequestApproved");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "active", reviewers: [{ vote: 10 }] } }), "pullRequestApproved");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "completed" } }), "pullRequestCompleted");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "abandoned" } }), "pullRequestAbandoned");
    assert.equal(notificationKind({ eventType: "build.complete", resource: { result: "failed" } }), "buildValidationFailed");
    assert.equal(notificationKind({ eventType: "build.complete", resource: { result: "succeeded" } }), "buildValidationSucceeded");
    assert.equal(notificationKind({ eventType: "git.pullrequest.merged", resource: { status: "completed" } }), "pullRequestCompleted");
  });

  it("hashes webhook tokens without retaining the raw secret", () => {
    assert.equal(hashAzureDevOpsToken("test-token"), hashAzureDevOpsToken("test-token"));
    assert.notEqual(hashAzureDevOpsToken("test-token"), "test-token");
  });

  it("encrypts and decrypts service-hook tokens", () => {
    const token = "service-hook-token";
    assert.equal(decryptAzureDevOpsToken(encryptAzureDevOpsToken(token)), token);
  });

  it("ignores unrelated Azure events", () => {
    assert.equal(notificationKind({ eventType: "git.pullrequest.commented", resource: {} }), null);
  });

  it("uses the link from a native Azure DevOps build service-hook event", () => {
    const body = messageBody("buildValidationFailed", {
      result: "failed",
      buildNumber: "echo-42",
      _links: { web: { href: "https://dev.azure.com/example/build/42" } },
    });
    assert.match(body, /\[Open in Azure DevOps\]\(https:\/\/dev\.azure\.com\/example\/build\/42\)/);
  });

  it("renders a reactivated pull-request notification", () => {
    assert.match(messageBody("pullRequestReactivated", { repository: { name: "echo" }, pullRequestId: 9, title: "Restore integration" }), /Pull request reactivated/);
  });

  it("recognizes approval and approval reset payload states", () => {
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "active", reviewers: [{ vote: 10 }] } }), "pullRequestApproved");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "active", reviewers: [{ vote: 0 }] } }), null);
  });
});
