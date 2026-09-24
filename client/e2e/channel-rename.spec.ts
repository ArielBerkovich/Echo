import { expect, test } from "@playwright/test";
import { apiRequestUrl, requestAsToken, seedWorkspaceFixture, slug, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function rawApi(page, token, path, options: { method?: string; body?: unknown } = {}) {
  // Use the host HTTP client for this API-only assertion flow. The browser's
  // Playwright request context can remain stuck behind the page's long-lived
  // Socket.IO connection after the channel has been renamed; this does not
  // reproduce with a normal HTTP client and is unrelated to the UI path.
  const response = await fetch(apiRequestUrl(`/api${path}`), {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${token}` },
    ...(options.body === undefined ? {} : {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(options.body),
    }),
  });
  return {
    status: () => response.status,
    json: () => response.json(),
  };
}

test("lets channel managers rename channels and rejects invalid or unauthorized changes", async ({ page }) => {
  const originalName = `rename-source-${uniqueSuffix("channel")}`.toLowerCase();
  const renamedName = `rename-target-${uniqueSuffix("channel")}`.toLowerCase();
  const occupiedName = `rename-occupied-${uniqueSuffix("channel")}`.toLowerCase();
  const channel = (await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: originalName, type: "public" },
  })).channel;
  const occupied = (await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: occupiedName, type: "public" },
  })).channel;

  try {
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/members`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });

    const unauthorized = await rawApi(page, fixture.bob.token, `/channels/${channel.id}`, {
      method: "PATCH",
      body: { name: renamedName },
    });
    expect(unauthorized.status()).toBe(403);

    for (const invalidName of ["", "bad_name", "bad--name", "-bad", "bad-", "general"]) {
      const response = await rawApi(page, fixture.alice.token, `/channels/${channel.id}`, {
        method: "PATCH",
        body: { name: invalidName },
      });
      expect(response.status(), `expected ${invalidName || "empty"} to be rejected`).toBe(400);
    }

    const duplicate = await rawApi(page, fixture.alice.token, `/channels/${channel.id}`, {
      method: "PATCH",
      body: { name: occupiedName },
    });
    expect(duplicate.status()).toBe(409);

    await page.goto(`/channels/${channel.name}`);
    await page.getByTestId("channel-title").click();
    const details = page.getByTestId("channel-details-dialog");
    const rename = details.getByTestId("channel-rename-section");
    await rename.getByTestId("channel-rename-edit").click();
    const renameInput = rename.getByRole("textbox", { name: "Channel name" });
    const saveRename = rename.getByRole("button", { name: "Save" });
    await renameInput.fill("bad_name");
    await expect(rename).toContainText("Use lowercase letters, numbers, and single dashes only.");
    await expect(saveRename).toBeDisabled();
    await renameInput.fill(occupiedName);
    await expect(rename).toContainText("This channel name is already in use.");
    await expect(saveRename).toBeDisabled();
    await renameInput.fill(renamedName);
    await expect(saveRename).toBeEnabled();
    await saveRename.click();

    await expect(page.getByTestId(`channel-row-${slug(renamedName)}`)).toBeVisible();
    await expect(page.getByTestId("channel-title")).toContainText(renamedName);

    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/managers`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });
    const delegatedRename = await rawApi(page, fixture.bob.token, `/channels/${channel.id}`, {
      method: "PATCH",
      body: { name: originalName },
    });
    expect(delegatedRename.status()).toBe(200);
    expect((await delegatedRename.json()).channel.name).toBe(originalName);
  } finally {
    await rawApi(page, fixture.alice.token, `/channels/${channel.id}/members/${fixture.bob.id}`, { method: "DELETE" });
    await rawApi(page, fixture.alice.token, `/channels/${channel.id}`, { method: "DELETE" });
    await rawApi(page, fixture.alice.token, `/channels/${occupied.id}`, { method: "DELETE" });
  }
});
