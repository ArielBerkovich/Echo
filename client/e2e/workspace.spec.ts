import { expect, test } from "@playwright/test";

const user = {
  id: "u1",
  username: "alice",
  displayName: "Alice",
  avatarUrl: null,
  isAdmin: true,
  mustResetPassword: false,
  onboarded: true,
};

const bob = {
  id: "u2",
  username: "bob",
  displayName: "Bob Builder",
  avatarUrl: null,
  isAdmin: false,
  mustResetPassword: false,
  onboarded: true,
};

const general = {
  id: "c1",
  name: "general",
  type: "public",
  topic: "Team updates",
  description: "",
  memberCount: 1,
  members: ["u1"],
  createdBy: "u1",
  createdAt: "2026-06-01T00:00:00.000Z",
  unread: 0,
};

const mentionBody = "Heads up @alice, can you check the deployment notes?";

const formattedBody = [
  "API formatting test",
  "",
  "# Heading 1",
  "",
  "**Bold text**",
  "_Italic text_",
  "~~Strikethrough text~~",
  "`inline code`",
  "",
  "```js",
  "const message = \"formatted via API\";",
  "```",
  "",
  "> Quote line",
  "",
  "- Bullet item",
  "1. Numbered item",
  "",
  "[Echo link](https://example.com)",
].join("\n");

const savedItem = {
  id: "m2",
  channelId: "c1",
  channelName: "general",
  channelType: "public",
  threadId: null,
  body: formattedBody,
  createdAt: "2026-06-01T09:02:00.000Z",
  author: user,
};

const activityItem = {
  id: "a1",
  kind: "mention",
  unread: true,
  channelId: "c1",
  channelName: "general",
  channelType: "public",
  threadId: null,
  body: mentionBody,
  createdAt: "2026-06-01T09:04:00.000Z",
  author: bob,
};

async function mockWorkspaceApi(page) {
  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 404, body: "" });
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ json: { user } });
  });
  await page.route("**/api/auth/setup-status", async (route) => {
    await route.fulfill({ json: { needsSetup: false } });
  });
  await page.route("**/api/channels/c1/messages**", async (route) => {
    await route.fulfill({
      json: {
        lastReadAt: "2026-06-01T00:00:00.000Z",
        messages: [
          {
            id: "m1",
            channelId: "c1",
            body: "Welcome to Echo",
            createdAt: "2026-06-01T09:00:00.000Z",
            editedAt: null,
            kind: "user",
            parentId: null,
            attachments: [],
            forwardedFrom: null,
            pinnedAt: null,
            pinnedBy: null,
            reactions: [],
            author: user,
          },
          {
            id: "m2",
            channelId: "c1",
            body: formattedBody,
            createdAt: "2026-06-01T09:02:00.000Z",
            editedAt: null,
            kind: "user",
            parentId: null,
            attachments: [],
            forwardedFrom: null,
            pinnedAt: null,
            pinnedBy: null,
            reactions: [],
            author: user,
          },
          {
            id: "m-mention",
            channelId: "c1",
            body: mentionBody,
            createdAt: "2026-06-01T09:04:00.000Z",
            editedAt: null,
            kind: "user",
            parentId: null,
            attachments: [],
            forwardedFrom: null,
            pinnedAt: null,
            pinnedBy: null,
            reactions: [],
            author: bob,
          },
        ],
      },
    });
  });
  await page.route("**/api/channels/c1/pinned", async (route) => {
    await route.fulfill({
      json: {
        messages: [
          {
            ...savedItem,
            pinnedAt: "2026-06-01T09:10:00.000Z",
            pinnedBy: user.id,
          },
        ],
      },
    });
  });
  await page.route("**/api/channels/*/read**", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/channels?scope=all", async (route) => {
    await route.fulfill({ json: { channels: [general] } });
  });
  await page.route("**/api/channels", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: { channel: { ...general, id: "c2", name: body.name, type: body.type } },
      });
      return;
    }
    await route.fulfill({ json: { channels: [general] } });
  });
  await page.route("**/api/dms", async (route) => {
    await route.fulfill({ json: { conversations: [] } });
  });
  await page.route("**/api/users/vips", async (route) => {
    await route.fulfill({ json: { vipIds: [] } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: [user, bob] } });
  });
  await page.route("**/api/emojis", async (route) => {
    await route.fulfill({ json: { emojis: [] } });
  });
  await page.route("**/api/activity/read", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/activity", async (route) => {
    await route.fulfill({ json: { items: [activityItem] } });
  });
  await page.route("**/api/saved/m2", async (route) => {
    await route.fulfill({ json: { saved: false } });
  });
  await page.route("**/api/saved", async (route) => {
    await route.fulfill({ json: { items: [savedItem] } });
  });
  await page.route("**/api/search/messages**", async (route) => {
    await route.fulfill({
      json: {
        hasMore: false,
        results: [
          {
            id: "m-search",
            channelId: "c1",
            channelName: "general",
            channelType: "public",
            parentId: null,
            body: "Welcome search result with a https://example.com link",
            createdAt: "2026-06-01T09:05:00.000Z",
            author: user,
          },
        ],
      },
    });
  });
  await page.route("**/api/scheduled?channelId=*", async (route) => {
    await route.fulfill({ json: { scheduled: [] } });
  });
}

test.beforeEach(async ({ page }) => {
  await mockWorkspaceApi(page);
  await page.addInitScript(() => {
    localStorage.setItem("echo.token", "token-1");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedText = text;
        },
      },
    });
  });
});

test("restores an authenticated session into the default channel", async ({ page }) => {
  const readSettled = page
    .waitForResponse((res) => res.url().includes("/api/channels/c1/read"))
    .catch(() => null);
  await page.goto("/");

  await expect(page.getByText("Echo").first()).toBeVisible();
  await expect(page.getByText("#general", { exact: true })).toBeVisible();
  await expect(page.getByText("Team updates")).toBeVisible();
  await readSettled;
});

test("sign out clears the session and returns to login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click({ force: true });

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("echo.token"))).resolves.toBeNull();
});

test("opens API reference from the sidebar footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByLabel("API reference").click({ force: true });

  await expect(page.getByText(/REST API/i)).toBeVisible();
});

test("keeps channel header actions inside the header when pinned panel is open", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.route("**/api/channels", async (route) => {
    await route.fulfill({
      json: {
        channels: [
          {
            ...general,
            name: "project-alpha",
            topic: "A very long planning topic that should truncate instead of pushing actions away",
          },
        ],
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Pinned messages" }).click();

  await expect(page.locator(".pinned-panel")).toBeVisible();
  const bounds = await page.evaluate(() => {
    const header = document.querySelector(".channel-header").getBoundingClientRect();
    const leave = document.querySelector(".header-action.leave").getBoundingClientRect();
    return {
      headerRight: header.right,
      leaveRight: leave.right,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(bounds.leaveRight).toBeLessThanOrEqual(bounds.headerRight + 1);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
});

test("copies the raw markdown body from a message", async ({ page }) => {
  await page.goto("/");
  const message = page.locator('.message[data-mid="m2"]');
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Copy message").click();

  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(formattedBody);
  await expect(message.getByTitle("Copied message")).toBeVisible();
});

test("pastes markdown into the composer as formatted content", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".composer-editor")).toBeVisible();

  await page.locator(".composer-editor").focus();
  await page.evaluate((body) => {
    const editor = document.querySelector(".composer-editor");
    const data = new DataTransfer();
    data.setData("text/plain", body);
    editor.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    }));
  }, formattedBody);

  const editor = page.locator(".composer-editor");
  await expect(editor.locator("h1")).toHaveText("Heading 1");
  await expect(editor.locator("strong")).toHaveText("Bold text");
  await expect(editor.locator("del")).toHaveText("Strikethrough text");
  await expect(editor.locator("pre code")).toContainText("formatted via API");
  await expect(editor.locator("blockquote")).toContainText("Quote line");
  await expect(editor.locator("li")).toContainText(["Bullet item", "Numbered item"]);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("Echo link");
});

test("shows activity items and marks activity as read", async ({ page }) => {
  let markedRead = false;
  await page.route("**/api/activity/read", async (route) => {
    markedRead = true;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Activity/ }).click();

  await expect(page.locator(".ch-name")).toHaveText("Activity");
  await expect(page.getByText("Bob Builder")).toBeVisible();
  await expect(page.getByText("mentioned you")).toBeVisible();
  await expect(page.locator(".activity-item .mention--me")).toHaveText("@alice");
  await expect.poll(() => markedRead).toBe(true);
});

test("shows saved messages and removes one from saved", async ({ page }) => {
  let unsavedMessageId = null;
  await page.route("**/api/saved/m2", async (route) => {
    unsavedMessageId = "m2";
    await route.fulfill({ json: { saved: false } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Saved/ }).click();

  await expect(page.locator(".ch-name")).toHaveText("Saved");
  await expect(page.getByText("API formatting test")).toBeVisible();
  await expect(page.locator(".activity-item").filter({ hasText: "API formatting test" })).toBeVisible();

  await page.getByTitle("Remove from saved").click();

  await expect(page.getByText("API formatting test")).toBeHidden();
  await expect.poll(() => unsavedMessageId).toBe("m2");
});

test("opens a profile from an @mention in a message", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.message[data-mid="m-mention"]')).toBeVisible();

  await page.locator('.message[data-mid="m-mention"] .mention--me').click();

  await expect(page.locator(".profile-modal")).toBeVisible();
  await expect(page.locator(".profile-modal")).toContainText("Alice");
  await expect(page.locator(".profile-modal")).toContainText("@alice");
});

test("searches messages with filters and displays results", async ({ page }) => {
  let requestedUrl = "";
  await page.route("**/api/search/messages**", async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({
      json: {
        hasMore: false,
        results: [
          {
            id: "m-search",
            channelId: "c1",
            channelName: "general",
            channelType: "public",
            parentId: null,
            body: "Welcome search result with a https://example.com link",
            createdAt: "2026-06-01T09:05:00.000Z",
            author: user,
          },
        ],
      },
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("Search messages, people, and channels").fill("Welcome in:general from:@alice has:link");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(page.locator(".ch-name")).toHaveText("Search");
  await expect(page.getByText("in: #general")).toBeVisible();
  await expect(page.getByText("from: @alice")).toBeVisible();
  await expect(page.getByText("has: link")).toBeVisible();
  await expect(page.locator(".search-result")).toContainText("Welcome search result");
  await expect(page.locator(".search-result mark")).toContainText("Welcome");
  await expect.poll(() => decodeURIComponent(requestedUrl)).toContain("q=Welcome in:general from:@alice has:link");
});
