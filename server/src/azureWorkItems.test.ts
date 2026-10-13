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

  it("rejects URLs that are not a dev.azure.com project URL", () => {
    assert.equal(normalizeAzureProjectUrl("http://dev.azure.com/org/project"), null);
    assert.equal(normalizeAzureProjectUrl("https://example.com/org/project"), null);
    assert.equal(normalizeAzureProjectUrl("https://dev.azure.com/org/project?view=1"), null);
    assert.equal(normalizeAzureProjectUrl("https://dev.azure.com/org"), null);
  });
});
