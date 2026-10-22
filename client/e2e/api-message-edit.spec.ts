import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

test("REST message edits update the message and reject non-authors", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `Before edit ${uniqueSuffix()}` },
  });
  const path = `/channels/${fixture.generalChannel.id}/messages/${created.message.id}`;

  const denied = await page.request.patch(`/api${path}`, {
    headers: { Authorization: `Bearer ${fixture.bob.token}` },
    data: { body: "Bob cannot edit Alice's message" },
  });
  expect(denied.status()).toBe(403);

  const edited = await requestAsToken(page, fixture.alice.token, path, {
    method: "PATCH",
    body: { body: "Edited over REST" },
  });
  expect(edited.message).toMatchObject({ id: created.message.id, body: "Edited over REST" });
  expect(edited.message.editedAt).toBeTruthy();

  const empty = await page.request.patch(`/api${path}`, {
    headers: { Authorization: `Bearer ${fixture.alice.token}` },
    data: { body: "   " },
  });
  expect(empty.status()).toBe(400);
});
