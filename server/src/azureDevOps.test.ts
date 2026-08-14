import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptAzureDevOpsToken, encryptAzureDevOpsToken, eventKey, hashAzureDevOpsToken, messageBody, notificationKind, rootReaction } from "./azureDevOps.js";

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
    assert.equal(notificationKind({ eventType: "git.push", resource: {} }), null);
    assert.equal(notificationKind({ eventType: "git.pullrequest.commented", resource: {} }), "pullRequestCommented");
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
    assert.match(messageBody("pullRequestReactivated", { repository: { name: "echo" }, pullRequestId: 9, title: "Restore integration" }), /Pull request recreated/);
  });

  it("recognizes approval and approval reset payload states", () => {
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "active", reviewers: [{ vote: 10 }] } }), "pullRequestApproved");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "active", reviewers: [{ vote: 0 }] } }), "pullRequestApprovalReset");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", message: { text: "Ariel changed the pull request title" }, resource: { status: "active", title: "New title", reviewers: [{ vote: 10 }] } }), "pullRequestTitleChanged");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", resource: { status: "active", reviewers: [{ vote: -10 }] } }), "pullRequestRejected");
  });

  it("prioritizes reviewer actions over a PR title containing rename words", () => {
    const resource = { status: "active", title: "Concurrent Azure QA lifecycle renamed", reviewers: [{ vote: -10 }] };
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", message: { text: "Ariel rejected pull request 35 (Concurrent Azure QA lifecycle renamed)" }, resource }), "pullRequestRejected");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", message: { text: "Ariel changed the reviewer list for pull request 35 (Concurrent Azure QA lifecycle renamed)" }, resource: { ...resource, reviewers: [{ vote: 0 }] } }), "pullRequestApprovalReset");
    assert.equal(notificationKind({ eventType: "git.pullrequest.updated", message: { text: "Ariel updated pull request 35 (Concurrent Azure QA lifecycle renamed)" }, resource }), "pullRequestTitleChanged");
  });

  it("deduplicates repeated semantic PR updates", () => {
    const payload = { eventType: "git.pullrequest.updated", resource: { pullRequestId: 35, title: "New title" } };
    assert.equal(eventKey(payload, "pullRequestTitleChanged", 35), eventKey({ ...payload, id: "different" }, "pullRequestTitleChanged", 35));
    assert.equal(eventKey(payload, "pullRequestApproved", 35), eventKey({ ...payload, id: "different" }, "pullRequestApproved", 35));
    assert.notEqual(eventKey(payload, "pullRequestApproved", 35), eventKey(payload, "pullRequestApprovalReset", 35));
  });

  it("uses Echo Git emoji shortcodes and requested status icons", () => {
    const created = messageBody("pullRequestCreated", { repository: { name: "echo" }, pullRequestId: 1, title: "Add integration" });
    assert.match(created, /^:git-pull-request: Pull request created\nRepository: \*\*echo\*\* · PR #1\nTitle: \*\*Add integration\*\*/);
    assert.match(messageBody("pullRequestCommented", { repository: { name: "echo" }, pullRequestId: 1, content: "A comment" }), /^📝/);
    assert.match(messageBody("pullRequestCommented", { pullRequest: { repository: { name: "echo" }, pullRequestId: 1 }, comment: { content: "A comment" } }), /\*\*echo\*\*/);
    assert.match(messageBody("pullRequestCompleted", { repository: { name: "echo" }, pullRequestId: 1, title: "Add integration" }), /^:merged:/);
    assert.match(messageBody("pullRequestApproved", {}), /^👍/);
    assert.match(messageBody("pullRequestApproved", { repository: { name: "echo" }, pullRequestId: 1, title: "Add integration", reviewers: [{ vote: 10, displayName: "Ariel Berkovich" }] }), /Approved by: \*\*Ariel Berkovich\*\*/);
    assert.match(messageBody("pullRequestTitleChanged", { repository: { name: "echo" }, pullRequestId: 1, title: "Renamed integration" }), /New title/);
    assert.equal(messageBody("pullRequestApprovalReset", {}), "🔄 Approval reset");
    assert.match(messageBody("buildValidationSucceeded", {}), /^✅/);
    assert.match(messageBody("buildValidationFailed", {}), /^❌/);
  });

  it("maps Azure states to root-message reactions", () => {
    assert.equal(rootReaction("pullRequestCreated"), null);
    assert.equal(rootReaction("pullRequestCompleted"), ":merged:");
    assert.equal(rootReaction("pullRequestAbandoned"), ":git-pull-request-closed:");
    assert.equal(rootReaction("pullRequestApproved"), "👍");
    assert.equal(rootReaction("buildValidationSucceeded"), "✅");
    assert.equal(rootReaction("buildValidationFailed"), "❌");
    assert.equal(rootReaction("pullRequestCommented"), "📝");
  });
});
