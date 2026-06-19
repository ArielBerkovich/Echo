import { expect } from "@playwright/test";
import crypto from "crypto";

const DEFAULT_PASSWORD = "Password1";
const FIXTURE_ID = uniqueSuffix("e2e");
let workspaceFixturePromise = null;

export function uniqueSuffix(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function registerUser(page, { username, password = DEFAULT_PASSWORD, displayName }) {
  const response = await page.request.post("/api/auth/register", {
    data: { username, password, displayName },
  });
  expect(response.ok(), `failed to register ${username}`).toBeTruthy();
  return response.json();
}

async function loginOrRegisterUser(page, user) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { username: user.username, password: user.password },
  });
  if (loginResponse.ok()) {
    return loginResponse.json();
  }

  const registerResponse = await page.request.post("/api/auth/register", {
    data: { username: user.username, password: user.password, displayName: user.displayName },
  });
  if (!registerResponse.ok() && registerResponse.status() !== 409) {
    const body = await registerResponse.json().catch(() => ({}));
    throw new Error(body.error || `failed to bootstrap ${user.username}`);
  }

  const retryResponse = await page.request.post("/api/auth/login", {
    data: { username: user.username, password: user.password },
  });
  expect(retryResponse.ok(), `failed to log in as ${user.username}`).toBeTruthy();
  return retryResponse.json();
}

export async function loginAndSeedToken(page, username, password) {
  const response = await page.request.post("/api/auth/login", {
    data: { username, password },
  });
  expect(response.ok(), `failed to log in as ${username}`).toBeTruthy();
  const { token } = await response.json();
  await seedToken(page, token);
}

export async function seedToken(page, token) {
  await page.addInitScript((value) => {
    localStorage.setItem("echo.token", value);
  }, token);
}

export async function requestAsCurrentUser(page, path, options = {}) {
  const token = await page.evaluate(() => localStorage.getItem("echo.token"));
  if (!token) throw new Error("missing auth token");
  return requestAsToken(page, token, path, options);
}

export async function requestAsToken(page, token, path, options = {}) {
  const response = await page.request.fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: options.body !== undefined ? options.body : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(data.error || `request failed (${response.status()})`);
  return data;
}

export async function seedWorkspaceFixture(page) {
  if (workspaceFixturePromise) {
    const fixture = await workspaceFixturePromise;
    await restoreWorkspaceFixture(page, fixture);
    await seedToken(page, fixture.alice.token);
    return fixture;
  }

  workspaceFixturePromise = (async () => {
    const suffix = FIXTURE_ID;
    const alice = {
      username: `alice-${suffix}`,
      displayName: `Alice ${suffix}`,
      password: DEFAULT_PASSWORD,
    };
    const bob = {
      username: `bob-${suffix}`,
      displayName: `Bob Builder ${suffix}`,
      password: DEFAULT_PASSWORD,
    };

    const aliceAuth = await loginOrRegisterUser(page, alice);
    const bobAuth = await loginOrRegisterUser(page, bob);
    await requestAsToken(page, aliceAuth.token, "/users/me/onboarded", { method: "POST" });
    await requestAsToken(page, bobAuth.token, "/users/me/onboarded", { method: "POST" });

    await seedToken(page, aliceAuth.token);

    const projectChannelName = `project-alpha-${suffix}`;
    const projectResponse = await page.request.get(
      `/api/channels/by-name/${encodeURIComponent(projectChannelName)}`,
      {
        headers: { Authorization: `Bearer ${aliceAuth.token}` },
      }
    );
    const projectChannel = projectResponse.ok()
      ? (await projectResponse.json()).channel
      : (await requestAsToken(page, aliceAuth.token, "/channels", {
          method: "POST",
          body: { name: projectChannelName, type: "public" },
        })).channel;
    const general = await requestAsToken(page, aliceAuth.token, "/channels/by-name/general");
    await requestAsToken(page, aliceAuth.token, `/channels/${projectChannel.id}`, {
      method: "PATCH",
      body: {
        type: "public",
        topic: "A very long planning topic that should truncate instead of pushing actions away",
        description: "Internal planning",
      },
    });

    const welcome = await requestAsToken(page, aliceAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: projectChannel.id,
        body: `Welcome to Echo ${suffix}`,
        externalKey: `welcome-${suffix}`,
      },
    });

    const formatted = await requestAsToken(page, aliceAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: general.channel.id,
        body: [
          `API formatting test ${suffix}`,
          "",
          "# Heading 1",
          "",
          "**Bold text**",
          "_Italic text_",
          "~~Strikethrough text~~",
          "`inline code`",
          "",
          "```js",
          'const message = "formatted via API";',
          "```",
          "",
          "> Quote line",
          "",
          "- Bullet item",
          "1. Numbered item",
          "",
          "[Echo link](https://example.com)",
        ].join("\n"),
        externalKey: `formatted-${suffix}`,
      },
    });

    const mention = await requestAsToken(page, bobAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: general.channel.id,
        body: `Heads up @${alice.username}, can you check the deployment notes?`,
        externalKey: `mention-${suffix}`,
      },
    });

    const searchHit = await requestAsToken(page, aliceAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: general.channel.id,
        body: `Welcome search result ${suffix} with a https://example.com link`,
        externalKey: `search-${suffix}`,
      },
    });

    const threadRoot = await requestAsToken(page, aliceAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: projectChannel.id,
        body: `Thread root in ${projectChannelName}`,
        externalKey: `thread-root-${suffix}`,
      },
    });

    const threadReply = await requestAsToken(page, bobAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: projectChannel.id,
        parentId: threadRoot.message.id,
        body: `Thread reply for Alice ${suffix}`,
        externalKey: `thread-reply-${suffix}`,
      },
    });

    const dm = await requestAsToken(page, aliceAuth.token, "/dms", {
      method: "POST",
      body: { userId: bobAuth.user.id },
    });
    const dmMessage = await requestAsToken(page, bobAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: dm.channel.id,
        body: `Bob's DM hello ${suffix}`,
        externalKey: `dm-hello-${suffix}`,
      },
    });

    await requestAsToken(page, aliceAuth.token, `/saved/${formatted.message.id}`, {
      method: "POST",
    });
    await requestAsToken(page, bobAuth.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: general.channel.id,
        body: `Reaction seed ${suffix}`,
        externalKey: `reaction-seed-${suffix}`,
      },
    });
    await requestAsToken(page, bobAuth.token, `/channels/${general.channel.id}/read`, {
      method: "POST",
    });

    const fixture = {
      suffix,
      alice: {
        ...alice,
        id: aliceAuth.user.id,
        token: aliceAuth.token,
        isAdmin: aliceAuth.user.isAdmin,
      },
      bob: {
        ...bob,
        id: bobAuth.user.id,
        token: bobAuth.token,
        isAdmin: bobAuth.user.isAdmin,
      },
      projectChannel: { id: projectChannel.id, name: projectChannelName },
      generalChannel: { id: general.channel.id, name: "general" },
      messages: {
        welcome: welcome.message,
        formatted: formatted.message,
        mention: mention.message,
        searchHit: searchHit.message,
        threadRoot: threadRoot.message,
        threadReply: threadReply.message,
        dmMessage: dmMessage.message,
      },
      dmChannel: dm.channel,
    };

    await restoreWorkspaceFixture(page, fixture);
    return fixture;
  })();

  const fixture = await workspaceFixturePromise;
  await seedToken(page, fixture.alice.token);
  return fixture;
}

async function restoreWorkspaceFixture(page, fixture) {
  await page.addInitScript(
    ({ aliceId, bobId }) => {
      if (sessionStorage.getItem("echo.fixtureStateReset") === "1") return;
      sessionStorage.setItem("echo.fixtureStateReset", "1");
      localStorage.clear();
    },
    { aliceId: fixture.alice.id, bobId: fixture.bob.id }
  );
  await requestAsToken(page, fixture.alice.token, "/users/me", {
    method: "PATCH",
    body: {
      displayName: fixture.alice.displayName,
      avatarKey: null,
    },
  });
  await requestAsToken(page, fixture.alice.token, "/users/me/onboarded", { method: "POST" });
  await requestAsToken(page, fixture.bob.token, "/users/me/onboarded", { method: "POST" });
  const dm = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  fixture.dmChannel = dm.channel;
  await requestAsToken(page, fixture.alice.token, `/channels/${fixture.projectChannel.id}`, {
    method: "PATCH",
    body: {
      type: "public",
      topic: "A very long planning topic that should truncate instead of pushing actions away",
      description: "Internal planning",
    },
  });

  const saved = await requestAsToken(page, fixture.alice.token, "/saved");
  for (const item of saved.items || []) {
    if (item.id !== fixture.messages.formatted.id) {
      await requestAsToken(page, fixture.alice.token, `/saved/${item.id}`, {
        method: "POST",
      });
    }
  }
  const hasFormatted = (saved.items || []).some((item) => item.id === fixture.messages.formatted.id);
  if (!hasFormatted) {
    await requestAsToken(page, fixture.alice.token, `/saved/${fixture.messages.formatted.id}`, {
      method: "POST",
    });
  }
}

export async function enableClipboardStub(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedText = text;
        },
      },
    });
  });
}

export function slug(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function channelRow(page, name) {
  return page.getByTestId(`channel-row-${slug(name)}`);
}

export function dmRow(page, name) {
  return page.getByTestId(`dm-row-${slug(name)}`);
}

export function railItem(page, key) {
  return page.getByTestId(`rail-${key}`);
}

export function messageById(page, id) {
  return page.getByTestId(`message-${id}`);
}

export function messageByText(page, text) {
  return page.locator('[data-testid^="message-"]').filter({ hasText: text });
}

export function composer(page) {
  return page.getByTestId("composer-editor");
}

export function settingsPage(page) {
  return page.getByTestId("settings-page");
}

export function profileModal(page) {
  return page.getByTestId("profile-modal");
}

export function addEmojiModal(page) {
  return page.getByTestId("add-emoji-modal");
}

export function activityItem(page) {
  return page.getByTestId("activity-item");
}

export function searchResult(page) {
  return page.getByTestId("search-result");
}

export function searchInput(page) {
  return page.getByTestId("search-input");
}

export function threadPanel(page) {
  return page.getByTestId("thread-panel");
}
