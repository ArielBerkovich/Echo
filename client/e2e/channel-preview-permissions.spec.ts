import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import { registerUser, seedToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

async function api(page, token, path, options: { method?: string; body?: unknown } = {}) {
  return page.request.fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: options.body,
  });
}

async function socketAction(page, token, event, payload) {
  const socket = io(new URL(page.url()).origin, { auth: { token }, transports: ["websocket"] });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return await new Promise<any>((resolve, reject) => {
      socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
    });
  } finally {
    socket.disconnect();
  }
}

test("public channel previews are read-only until the user joins", async ({ page, browser }) => {
  const fixture = await seedWorkspaceFixture(page);
  await page.goto("/");
  const suffix = uniqueSuffix("preview-permissions");
  const outsider = await registerUser(page, {
    username: `preview.bob${Date.now().toString(36).slice(-8)}`,
    displayName: "Preview Bob",
  });
  const aliceAuth = { token: fixture.alice.token };
  const bobAuth = { token: outsider.token };
  await api(page, bobAuth.token, "/users/me/onboarded", { method: "POST" });

  const created = await api(page, aliceAuth.token, "/channels", {
    method: "POST",
    body: { name: suffix, type: "public" },
  });
  expect(created.ok()).toBeTruthy();
  const channel = (await created.json()).channel;
  const rootResponse = await api(page, aliceAuth.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: { body: `Preview root ${suffix}` },
  });
  const root = (await rootResponse.json()).message;
  const replyResponse = await api(page, aliceAuth.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: { body: `Preview reply ${suffix}`, parentId: root.id },
  });
  expect(replyResponse.ok()).toBeTruthy();
  const surveyResponse = await api(page, aliceAuth.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: {
      body: "",
      survey: { question: `Preview survey ${suffix}`, options: [{ label: "Yes" }, { label: "No" }] },
    },
  });
  expect(surveyResponse.ok()).toBeTruthy();
  const survey = (await surveyResponse.json()).message;
  const pinResult = await socketAction(page, aliceAuth.token, "message:pin", { messageId: root.id });
  expect(pinResult).toEqual({ ok: true });

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await seedToken(bobPage, bobAuth.token);
    await bobPage.goto(`/channels/${channel.id}`);
    await expect(bobPage.getByTestId("channel-view")).toBeVisible();
    await expect(bobPage.getByTestId("join-channel")).toBeVisible();
    await expect(bobPage.getByTestId("composer-editor")).toHaveCount(0);
    await expect(bobPage.getByTestId(`message-${root.id}`)).toContainText(`Preview root ${suffix}`);

    await bobPage.getByTestId("channel-pinned").click();
    await expect(bobPage.getByTestId("pinned-panel")).toBeVisible();
    await expect(bobPage.getByTestId(`pinned-${root.id}-unpin`)).toHaveCount(0);
    await bobPage.getByTestId("channel-pinned").click();

    await bobPage.getByTestId(`message-${root.id}-reply-count`).click();
    await expect(bobPage.getByTestId("thread-panel")).toBeVisible();
    await expect(bobPage.getByTestId("thread-panel").getByTestId("composer-editor")).toHaveCount(0);
    await expect(bobPage.getByTestId("thread-panel").getByText("Managers only")).toHaveCount(0);
    await expect(bobPage.getByTestId("thread-follow-toggle")).toHaveCount(0);
    await expect(bobPage.getByTestId(`message-${root.id}-add-reaction-action`)).toHaveCount(0);

    const message = await api(bobPage, bobAuth.token, `/channels/${channel.id}/messages`, {
      method: "POST",
      body: { body: "Should be rejected", parentId: root.id },
    });
    expect(message.status()).toBe(403);
    const reaction = await api(bobPage, bobAuth.token, `/channels/${channel.id}/messages/${root.id}/reactions`, {
      method: "POST",
      body: { emoji: "👍" },
    });
    expect(reaction.status()).toBe(403);
    const vote = await api(bobPage, bobAuth.token, `/channels/${channel.id}/messages/${survey.id}/survey-vote`, {
      method: "POST",
      body: { optionIds: [survey.survey.options[0].id] },
    });
    expect(vote.status()).toBe(403);
    const follow = await api(bobPage, bobAuth.token, `/channels/${channel.id}/threads/${root.id}/follow`);
    expect(follow.status()).toBe(404);
    const pin = await socketAction(bobPage, bobAuth.token, "message:pin", { messageId: root.id });
    expect(pin.error).toBe("access denied");

    const join = await api(bobPage, bobAuth.token, `/channels/${channel.id}/join`, { method: "POST" });
    expect(join.ok()).toBeTruthy();
    await bobPage.reload();
    await expect(bobPage.getByTestId("composer-editor")).toBeVisible();

    const joinedReaction = await api(bobPage, bobAuth.token, `/channels/${channel.id}/messages/${root.id}/reactions`, {
      method: "POST",
      body: { emoji: "👍" },
    });
    expect(joinedReaction.ok()).toBeTruthy();
    const joinedReply = await api(bobPage, bobAuth.token, `/channels/${channel.id}/messages`, {
      method: "POST",
      body: { body: `Joined reply ${suffix}`, parentId: root.id },
    });
    expect(joinedReply.status()).toBe(201);
    const joinedFollow = await api(bobPage, bobAuth.token, `/channels/${channel.id}/threads/${root.id}/follow`, {
      method: "PUT",
      body: { following: true },
    });
    expect(joinedFollow.ok()).toBeTruthy();
    const joinedPin = await socketAction(bobPage, bobAuth.token, "message:pin", { messageId: root.id });
    expect(joinedPin).toEqual({ ok: true });
  } finally {
    await bobContext.close();
    await api(page, aliceAuth.token, `/channels/${channel.id}/members/${outsider.user.id}`, { method: "DELETE" });
    await api(page, aliceAuth.token, `/channels/${channel.id}`, { method: "DELETE" });
  }
});
