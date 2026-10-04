import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

let requestId = 0;

async function mcpRequest(page, token, body) {
  const mcpBaseUrl = process.env.ECHO_E2E_API_BASE_URL || "http://127.0.0.1:4000";
  const response = await page.request.post(new URL("/mcp", mcpBaseUrl).toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
    },
    data: body,
  });
  const raw = await response.text();
  expect(response.ok(), raw || `MCP request failed (${response.status()})`).toBeTruthy();
  if (response.headers()["content-type"]?.includes("text/event-stream")) {
    const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
    return JSON.parse(dataLine?.slice(6) || "{}");
  }
  return JSON.parse(raw);
}

async function mcpCall(page, token, name, args) {
  return mcpRequest(page, token, {
    jsonrpc: "2.0",
    id: ++requestId,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

function resultValue(response) {
  expect(response.error, JSON.stringify(response)).toBeUndefined();
  const text = response.result?.content?.find((item) => item.type === "text")?.text;
  expect(text, JSON.stringify(response)).toBeTruthy();
  return JSON.parse(text);
}

test("MCP sends a message through the shared delivery service", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const body = `MCP delivery E2E ${fixture.suffix}`;
  const response = await mcpCall(page, fixture.alice.token, "echo_send_message", {
    channel: fixture.generalChannel.name,
    body,
  });
  const value = resultValue(response);

  expect(value.message.body).toBe(body);
  expect(value.message.author.id).toBe(fixture.alice.id);
});

test("MCP creates a direct conversation through the shared conversation service", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const response = await mcpCall(page, fixture.alice.token, "echo_create_dm", {
    users: [fixture.bob.username],
  });
  const value = resultValue(response);

  expect(value.channel.type).toBe("dm");
  expect(value.channel.members).toEqual(expect.arrayContaining([fixture.alice.id, fixture.bob.id]));
});

test("MCP uploads and sends an attachment through shared services", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const upload = resultValue(await mcpCall(page, fixture.alice.token, "echo_upload_file", {
    data: Buffer.from("MCP attachment E2E").toString("base64"),
    name: "mcp-e2e.txt",
    contentType: "text/plain",
  }));
  expect(upload.attachment.key).toMatch(/^[a-z0-9-]+\.txt$/i);

  const response = await mcpCall(page, fixture.alice.token, "echo_send_message", {
    channel: fixture.generalChannel.name,
    body: "MCP attachment message",
    attachments: [{
      key: upload.attachment.key,
      name: "mcp-e2e.txt",
      size: upload.attachment.size,
      contentType: upload.attachment.contentType,
      isImage: upload.attachment.isImage,
    }],
  });
  const value = resultValue(response);

  expect(value.message.attachments).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: upload.attachment.key, name: "mcp-e2e.txt" }),
  ]));
});
