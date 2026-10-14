import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAzureProjectUrl } from "./azureWorkItems.js";

describe("Azure DevOps project URLs", () => {
  it("normalizes an organization and project URL", () => {
    assert.equal(
      normalizeAzureProjectUrl("https://dev.azure.com/arielberkovich1/Echo/"),
      "https://dev.azure.com/arielberkovich1/Echo",
    );
  });

  it("accepts legacy work item edit URLs and reduces them to the project URL", () => {
    assert.equal(
      normalizeAzureProjectUrl("https://dev.azure.com/arielberkovich1/Echo/_workitems/edit"),
      "https://dev.azure.com/arielberkovich1/Echo",
    );
  });

  it("accepts URLs regardless of host or project path shape", () => {
    assert.equal(normalizeAzureProjectUrl("https://org.visualstudio.com/Echo"), "https://org.visualstudio.com/Echo");
    assert.equal(normalizeAzureProjectUrl("https://ado.example.com/tfs/collection/Echo/_workitems/edit"), "https://ado.example.com/tfs/collection/Echo");
    assert.equal(normalizeAzureProjectUrl("http://internal.example.com/team"), "http://internal.example.com/team");
    assert.equal(normalizeAzureProjectUrl("https://internal.example.com"), "https://internal.example.com");
  });

  it("rejects malformed URLs and URLs with credentials or query data", () => {
    assert.equal(normalizeAzureProjectUrl("https://user:pass@example.com/org/project"), null);
    assert.equal(normalizeAzureProjectUrl("https://dev.azure.com/org/project?view=1"), null);
    assert.equal(normalizeAzureProjectUrl("https://dev.azure.com/org"), null);
  });
});
