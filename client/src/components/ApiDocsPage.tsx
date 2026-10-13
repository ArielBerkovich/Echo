import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { api, getBackendUrl } from "../api.js";
import { apiEndpointKey } from "../lib/apiDocs.js";
import { CloseButton } from "./Button.js";

const ORIGIN = getBackendUrl() || (typeof window !== "undefined" ? window.location.origin : "https://your-echo-host");

// The REST endpoints for creating channels and sending messages. Each carries a
// ready-to-paste curl that embeds the token generated on this page.
function buildGroups(token) {
  const T = token || "YOUR_API_TOKEN";
  const auth = `-H "Authorization: Bearer ${T}"`;
  const json = `-H "Content-Type: application/json"`;
  return [
    {
      title: "Channels",
      note: "Use these to find or create the channel ids used by message calls.",
      endpoints: [
        {
          method: "GET",
          path: "/api/channels",
          desc: "List your channels. ?scope=all keeps the complete legacy catalog; add catalog=1 with q, membership, limit, and cursor for paginated public-channel summaries.",
          curl: `curl ${ORIGIN}/api/channels \\
  ${auth}`,
        },
        {
          method: "GET",
          path: "/api/channels/:id",
          desc: "A channel's info — { channel, creator, members } with the creator and members resolved to user objects.",
          curl: `curl ${ORIGIN}/api/channels/CHANNEL_ID \\
  ${auth}`,
        },
        {
          method: "GET",
          path: "/api/channels/by-name/:name",
          desc: "Resolve a channel id from a CI-friendly name like deploys or #deploys.",
          curl: `curl ${ORIGIN}/api/channels/by-name/deploys \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/channels",
          desc: 'Create a channel. Body: { name, type } — type is "public" or "private".',
          curl: `curl -X POST ${ORIGIN}/api/channels \\
  ${auth} \\
  ${json} \\
  -d '{"name":"my-channel","type":"public"}'`,
        },
      ],
    },
    {
      title: "Users",
      note: "Use a user's id to open a DM.",
      endpoints: [
        {
          method: "GET",
          path: "/api/users",
          desc: "List all users (id, username, displayName).",
          curl: `curl ${ORIGIN}/api/users \\
  ${auth}`,
        },
      ],
    },
    {
      title: "Read messages",
      note: "Read message history by channel id. Private channels and direct messages require membership.",
      endpoints: [
        {
          method: "GET",
          path: "/api/channels/:channelId/messages",
          desc: "Read the latest channel messages in chronological order. Returns { messages, lastReadAt }. Use before with an ISO timestamp to page older history, or around with a message id to load around a specific message.",
          curl: `curl "${ORIGIN}/api/channels/CHANNEL_ID/messages" \\
  ${auth}`,
        },
        {
          method: "GET",
          path: "/api/channels/:channelId/messages/:messageId/thread",
          desc: "Read a message thread. Returns { parent, replies }.",
          curl: `curl "${ORIGIN}/api/channels/CHANNEL_ID/messages/MESSAGE_ID/thread" \\
  ${auth}`,
        },
      ],
    },
    {
      title: "Send messages",
      note: "This REST endpoint mirrors the message:send Socket.IO event. Use a channel name or channel id in the path. Optional fields include parentId for thread replies, broadcastToChannel, attachments, card, survey, and retro. You can send an Idempotency-Key header to safely retry a request.",
      formats: [
        { label: "Bold", syntax: "**bold text**" },
        { label: "Italic", syntax: "_italic text_" },
        { label: "Strikethrough", syntax: "~~old text~~" },
        { label: "Inline code", syntax: "`const id = 1`" },
        { label: "Code block", syntax: "```js\nconsole.log('hi')\n```" },
        { label: "Quote", syntax: "> quoted text" },
        { label: "Bulleted list", syntax: "- first item\n- second item" },
        { label: "Numbered list", syntax: "1. first item\n2. second item" },
        { label: "Link", syntax: "[Echo](https://example.com)" },
        { label: "Mention", syntax: "@username or @everyone" },
        { label: "Emoji", syntax: ":smile: or :custom_emoji:" },
      ],
      endpoints: [
        {
          method: "POST",
          path: "/api/channels/:channel/messages",
          desc: "Send a message to a channel by name or id. Body: { body, parentId?, broadcastToChannel?, attachments?, card?, survey?, retro?, idempotencyKey? }.",
          curl: `curl -X POST ${ORIGIN}/api/channels/general/messages \\
  ${auth} \\
  ${json} \\
  -d '{"body":"Hello from the Echo API"}'`,
        },
        {
          method: "POST",
          path: "/api/dms",
          desc: "To message a person, open (or fetch) your DM with them. Body: { userId }. Returns { channel } — use channel.id as the :id above.",
          curl: `curl -X POST ${ORIGIN}/api/dms \\
  ${auth} \\
  ${json} \\
  -d '{"userId":"USER_ID"}'`,
        },
        {
          method: "POST",
          path: "/api/users/:username/messages",
          desc: "Send a direct message by username. The DM is created or reused automatically; use your own username for a personal notes conversation.",
          curl: `curl -X POST ${ORIGIN}/api/users/bob.builder/messages \\
  ${auth} \\
  ${json} \\
  -d '{"body":"Hello Bob"}'`,
        },
      ],
    },
    {
      title: "Message tools",
      endpoints: [
        {
          method: "GET",
          path: "/api/search/messages?q=:query&page=:page",
          desc: "Search messages you can access. Supports in:channel, from:@username, and has:file|image|link filters. Pages contain up to 20 results.",
          curl: `curl --get ${ORIGIN}/api/search/messages \\
  ${auth} \\
  --data-urlencode 'q=deploy in:general'`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/messages/:messageId/reactions",
          desc: "Toggle a reaction, or set present to true/false to add or remove it idempotently. Body: { emoji, present? }.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/messages/MESSAGE_ID/reactions \\
  ${auth} \\
  ${json} \\
  -d '{"emoji":"👍","present":true}'`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/messages/:messageId/survey-vote",
          desc: "Replace your survey selection. Body: { optionIds }; use an empty array to clear your vote.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/messages/MESSAGE_ID/survey-vote \\
  ${auth} \\
  ${json} \\
  -d '{"optionIds":["OPTION_ID"]}'`,
        },
        {
          method: "GET",
          path: "/api/channels/:channelId/pinned",
          desc: "List pinned messages in a channel. Returns { messages }.",
          curl: `curl ${ORIGIN}/api/channels/CHANNEL_ID/pinned \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/messages/:messageId/thread-summary",
          desc: "Generate an AI summary for a thread when thread summaries are enabled.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/messages/MESSAGE_ID/thread-summary \\
  ${auth}`,
        },
      ],
    },
    {
      title: "Channel and DM management",
      endpoints: [
        {
          method: "POST",
          path: "/api/channels/:channelId/join",
          desc: "Join a public channel. Private channels are invite-only.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/join \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/leave",
          desc: "Leave a channel. A manager may need to pass managerId when leaving.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/leave \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/members",
          desc: "Add a user to a channel. Body: { userId }.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/members \\
  ${auth} \\
  ${json} \\
  -d '{"userId":"USER_ID"}'`,
        },
        {
          method: "DELETE",
          path: "/api/channels/:channelId/members/:userId",
          desc: "Remove a member from a channel. Only the channel creator can remove members.",
          curl: `curl -X DELETE ${ORIGIN}/api/channels/CHANNEL_ID/members/USER_ID \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/managers",
          desc: "Promote a channel member to manager. Body: { userId }.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/managers \\
  ${auth} \\
  ${json} \\
  -d '{"userId":"USER_ID"}'`,
        },
        {
          method: "GET",
          path: "/api/dms",
          desc: "List your direct message conversations. Returns { conversations }.",
          curl: `curl ${ORIGIN}/api/dms \\
  ${auth}`,
        },
        {
          method: "PATCH",
          path: "/api/dms/:id",
          desc: "Rename a group DM. Body: { name }.",
          curl: `curl -X PATCH ${ORIGIN}/api/dms/DM_ID \\
  ${auth} \\
  ${json} \\
  -d '{"name":"project-chat"}'`,
        },
        {
          method: "DELETE",
          path: "/api/dms/:id",
          desc: "Hide a DM from your sidebar.",
          curl: `curl -X DELETE ${ORIGIN}/api/dms/DM_ID \\
  ${auth}`,
        },
      ],
    },
    {
      title: "Saved messages, activity, and scheduling",
      endpoints: [
        {
          method: "GET",
          path: "/api/saved",
          desc: "List your saved messages. Returns { items }.",
          curl: `curl ${ORIGIN}/api/saved \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/saved/:messageId",
          desc: "Toggle whether a message is saved for later.",
          curl: `curl -X POST ${ORIGIN}/api/saved/MESSAGE_ID \\
  ${auth}`,
        },
        {
          method: "GET",
          path: "/api/activity",
          desc: "List your recent mentions, broadcasts, and thread replies. Returns { items }.",
          curl: `curl ${ORIGIN}/api/activity \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/activity/read",
          desc: "Mark displayed activity items as read. Body: { items: [{ id, createdAt }] }.",
          curl: `curl -X POST ${ORIGIN}/api/activity/read \\
  ${auth} \\
  ${json} \\
  -d '{"items":[{"id":"ACTIVITY_ID","createdAt":"2026-10-13T09:00:00.000Z"}]}'`,
        },
        {
          method: "DELETE",
          path: "/api/activity/:id",
          desc: "Dismiss one activity item.",
          curl: `curl -X DELETE ${ORIGIN}/api/activity/ACTIVITY_ID \\
  ${auth}`,
        },
        {
          method: "DELETE",
          path: "/api/activity",
          desc: "Dismiss your activity feed.",
          curl: `curl -X DELETE ${ORIGIN}/api/activity \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/channels/:channelId/read",
          desc: "Mark a channel or DM as read. Optionally pass thread with a root message id to mark a thread read. Body: { thread? }.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/read \\
  ${auth} \\
  ${json} \\
  -d '{}'`,
        },
        {
          method: "POST",
          path: "/api/scheduled",
          desc: "Schedule a message for future delivery. Body: { channelId, body, scheduledFor, parentId?, attachments? }.",
          curl: `curl -X POST ${ORIGIN}/api/scheduled \\
  ${auth} \\
  ${json} \\
  -d '{"channelId":"CHANNEL_ID","body":"Deploy update","scheduledFor":"2030-01-15T09:00:00.000Z"}'`,
        },
        {
          method: "GET",
          path: "/api/scheduled",
          desc: "List your pending scheduled messages. Add channelId to filter by channel.",
          curl: `curl ${ORIGIN}/api/scheduled \\
  ${auth}`,
        },
        {
          method: "PATCH",
          path: "/api/scheduled/:id",
          desc: "Update a scheduled message body and/or scheduledFor time.",
          curl: `curl -X PATCH ${ORIGIN}/api/scheduled/SCHEDULED_MESSAGE_ID \\
  ${auth} \\
  ${json} \\
  -d '{"body":"Updated deploy update"}'`,
        },
        {
          method: "DELETE",
          path: "/api/scheduled/:id",
          desc: "Cancel a scheduled message.",
          curl: `curl -X DELETE ${ORIGIN}/api/scheduled/SCHEDULED_MESSAGE_ID \\
  ${auth}`,
        },
      ],
    },
    {
      title: "Custom emoji",
      endpoints: [
        {
          method: "GET",
          path: "/api/emojis",
          desc: "List custom emoji available in the workspace. Returns { emojis }.",
          curl: `curl ${ORIGIN}/api/emojis \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/emojis",
          desc: "Add a custom emoji image using multipart form fields name and file.",
          curl: `curl -X POST ${ORIGIN}/api/emojis \\
  ${auth} \\
  -F "name=party_parrot" \\
  -F "file=@/path/to/emoji.png"`,
        },
      ],
    },
    {
      title: "OpenAPI",
      endpoints: [
        {
          method: "GET",
          path: "/api/openapi.json",
          desc: "Machine-readable OpenAPI document for scripting and client generation.",
          curl: `curl ${ORIGIN}/api/openapi.json`,
        },
      ],
    },
    {
      title: "Files",
      endpoints: [
        {
          method: "POST",
          path: "/api/uploads",
          desc: "Upload files (multipart). Returns { attachments } — pass those objects to a send call.",
          curl: `curl -X POST ${ORIGIN}/api/uploads \\
  ${auth} \\
  -F "files=@/path/to/file.png"`,
        },
        {
          id: "send-with-attachment",
          method: "POST",
          path: "/api/channels/:channelName/messages",
          desc: "Send a message WITH a file — upload it first, then include the returned attachment object(s) in \"attachments\".",
          curl: `# 1) upload the file → grab its "attachments" array
curl -s -X POST ${ORIGIN}/api/uploads \\
  ${auth} \\
  -F "files=@/path/to/file.png"
# → { "attachments": [ { "key": "...", "name": "file.png", "contentType": "image/png", "isImage": true } ] }

# 2) send a message that includes it
curl -X POST ${ORIGIN}/api/channels/general/messages \\
  ${auth} \\
  ${json} \\
  -d '{"body":"See attached","attachments":[{"key":"UPLOADED_KEY","name":"file.png","contentType":"image/png","isImage":true}]}'`,
        },
      ],
    },
  ];
}

export default function ApiDocsPage({ onClose, embedded = false }) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set(["Read messages", "Send messages"]));

  const groups = buildGroups(token);

  function toggleGroup(title) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.getApiToken();
      setToken(token);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const content = (
    <div className="api-inner">
          {/* Token generation lives in its own panel above the columns, so
              generating a token doesn't reflow/shift the endpoint cards. */}
          <section className="settings-section api-token-panel">
            <h3>Your API token</h3>
            <p className="settings-hint">
              Bearer token for the REST API at <code>{ORIGIN}/api</code>. Every curl below includes
              it. Valid for three years — keep it secret.
            </p>
            {token ? (
              <div className="token-box" data-testid="api-token-box">
                <code className="token-value" data-testid="api-token-value">{token}</code>
                <button type="button" className="btn-secondary" data-testid="api-token-copy" onClick={() => copy(token, "token")}>
                  {copied === "token" ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary" data-testid="api-token-generate" disabled={busy} onClick={generate}>
                {busy ? "Generating…" : "Generate API token"}
              </button>
            )}
            {error && <div className="error">{error}</div>}
            {!token && (
              <p className="settings-hint api-token-hint">
                Until you generate one, the curls below use a YOUR_API_TOKEN placeholder.
              </p>
            )}
          </section>

          <div className="api-groups">
            {groups.map((g) => (
              <section className="settings-section api-group" key={g.title}>
                <button
                  type="button"
                  className="api-group-toggle"
                  onClick={() => toggleGroup(g.title)}
                  aria-expanded={openGroups.has(g.title)}
                >
                  <span className="api-group-title">
                    <ChevronDownIcon
                      className={`api-chevron ${openGroups.has(g.title) ? "" : "collapsed"}`}
                      size={12}
                      strokeWidth={2.4}
                    />
                    <span>{g.title}</span>
                  </span>
                  <span className="api-group-count">{g.endpoints.length}</span>
                </button>
                {openGroups.has(g.title) && (
                  <div className="api-group-body">
                    {g.note && <p className="settings-hint api-note">{g.note}</p>}
                    {g.formats && (
                      <div className="api-format-help" aria-label="Message formatting syntax">
                        <div className="api-format-title">Message body formatting</div>
                        <div className="api-format-grid">
                          {g.formats.map((f) => (
                            <div className="api-format-row" key={f.label}>
                              <span>{f.label}</span>
                              <code>{f.syntax}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <ul className="api-endpoints">
                      {g.endpoints.map((e) => {
                        const k = apiEndpointKey(e);
                        return (
                          <li className="api-endpoint" key={k}>
                            <div className="api-line">
                              <span className={`api-method m-${e.method.toLowerCase()}`}>{e.method}</span>
                              <code className="api-path">{e.path}</code>
                            </div>
                            <div className="api-desc">{e.desc}</div>
                            <button type="button" className="api-copy" onClick={() => copy(e.curl, k)}>
                              {copied === k ? "Copied" : "Copy curl"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>
    </div>
  );

  if (embedded) return <div className="api-embedded" data-testid="api-reference-page">{content}</div>;

  return (
    <div className="settings-page api-page" data-testid="api-reference-page">
      <header className="settings-page-head">
        <h2>API reference</h2>
        <CloseButton onClick={onClose} label="API reference" />
      </header>
      <div className="settings-page-body">{content}</div>
    </div>
  );
}
