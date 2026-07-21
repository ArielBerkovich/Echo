import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderPRValidationFailed,
  renderPRCompleted,
  renderCommentDigest,
  BuildResource,
  PullRequestResource,
} from "../lib/adoMessageRenderer.js";

const fakeBuildResource: BuildResource = {
  id: 9981,
  buildNumber: "20260721.5",
  url: "https://dev.azure.com/org/project/_build/results?buildId=9981",
  definition: { name: "PR Validation - main" },
  repository: { name: "backend-service" },
  triggerInfo: { "pr.number": "284", "pr.title": "feat: add payment gateway" },
  requestedBy: { displayName: "Bob Smith", uniqueName: "bob@company.com" },
  requestedFor: { displayName: "Alice Chen", uniqueName: "alice@company.com" },
};

const fakePRResource: PullRequestResource = {
  pullRequestId: 284,
  title: "feat: add payment gateway",
  url: "https://dev.azure.com/org/project/_git/backend-service/pullrequest/284",
  repository: { name: "backend-service", project: { name: "MyProject" } },
  createdBy: { displayName: "Alice Chen", uniqueName: "alice@company.com" },
  reviewers: [{ displayName: "Bob Smith", vote: 10 }],
  closedDate: "2026-07-21T11:00:00Z",
};

describe("adoMessageRenderer — renderPRValidationFailed", () => {
  it("includes repository, PR reference, pipeline name, and build run link", () => {
    const msg = renderPRValidationFailed(fakeBuildResource, null);
    assert.ok(msg.includes("backend-service"), "should include repo name");
    assert.ok(msg.includes("#284"), "should include PR number");
    assert.ok(msg.includes("feat: add payment gateway"), "should include PR title");
    assert.ok(msg.includes("PR Validation - main"), "should include pipeline name");
    assert.ok(msg.includes("20260721.5"), "should include build number");
    assert.ok(msg.includes("FAILED"), "should mark as FAILED");
    assert.ok(msg.includes("_build/results?buildId=9981"), "should include build run link");
  });

  it("includes enrichment data when detail is provided", () => {
    const msg = renderPRValidationFailed(fakeBuildResource, {
      failedJobName: "Build & Test",
      failedStepName: "Run unit tests",
      logUrl: "https://logs.example.com/1",
    });
    assert.ok(msg.includes("Build & Test"), "should include failed job name");
    assert.ok(msg.includes("Run unit tests"), "should include failed step name");
    assert.ok(msg.includes("https://logs.example.com/1"), "should include log URL");
  });

  it("omits enrichment section when detail is null", () => {
    const msg = renderPRValidationFailed(fakeBuildResource, null);
    assert.ok(!msg.includes("Failed Stage"), "should not include stage line without detail");
  });
});

describe("adoMessageRenderer — renderPRCompleted", () => {
  it("includes repository, PR title, author, and approver", () => {
    const msg = renderPRCompleted(fakePRResource);
    assert.ok(msg.includes("backend-service"), "should include repo name");
    assert.ok(msg.includes("#284"), "should include PR number");
    assert.ok(msg.includes("feat: add payment gateway"), "should include PR title");
    assert.ok(msg.includes("Alice Chen"), "should include PR author");
    assert.ok(msg.includes("Bob Smith"), "should include approver");
    assert.ok(msg.includes("MERGED"), "should mark as merged");
  });

  it("omits approver line when no reviewer voted to approve", () => {
    const resource = { ...fakePRResource, reviewers: [{ displayName: "Bob Smith", vote: 0 }] };
    const msg = renderPRCompleted(resource);
    assert.ok(!msg.includes("Approved by"), "should omit approver line when vote != 10");
  });
});

describe("adoMessageRenderer — renderCommentDigest", () => {
  const comments = [
    { authorDisplayName: "Bob Smith", content: "Please extract this." },
    { authorDisplayName: "Carol Davis", content: "Variable name is misleading." },
  ];

  it("includes PR reference, repo name, and all comment content", () => {
    const msg = renderCommentDigest("284", "feat: add payment gateway", "https://example.com/pr/284", "backend-service", comments);
    assert.ok(msg.includes("#284"), "should include PR number");
    assert.ok(msg.includes("backend-service"), "should include repo name");
    assert.ok(msg.includes("Bob Smith"), "should include first commenter");
    assert.ok(msg.includes("Carol Davis"), "should include second commenter");
    assert.ok(msg.includes("Please extract this."), "should include first comment text");
    assert.ok(msg.includes("Variable name is misleading."), "should include second comment text");
  });

  it("renders comment content as blockquotes", () => {
    const msg = renderCommentDigest("1", "title", "https://example.com", "repo", [
      { authorDisplayName: "Alice", content: "Line one\nLine two" },
    ]);
    assert.ok(msg.includes("> Line one"), "should quote line one");
    assert.ok(msg.includes("> Line two"), "should quote line two");
  });

  it("uses singular noun for one comment", () => {
    const msg = renderCommentDigest("1", "title", "https://example.com", "repo", [
      { authorDisplayName: "Alice", content: "Hello." },
    ]);
    assert.ok(msg.includes("1 comment"), "should use singular noun");
    assert.ok(!msg.includes("1 comments"), "should not use plural noun for one comment");
  });

  it("uses plural noun for multiple comments", () => {
    const msg = renderCommentDigest("1", "title", "https://example.com", "repo", comments);
    assert.ok(msg.includes("2 comments"), "should use plural noun");
  });
});
