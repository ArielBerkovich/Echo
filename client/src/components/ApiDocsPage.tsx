import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { api } from "../api.js";
import { apiEndpointKey } from "../lib/apiDocs.js";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://your-echo-host";

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
          desc: "List your channels (each with id, name, type). Add ?scope=all to list every public channel.",
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
      title: "Messages",
      note: "Also available in real time over Socket.IO — emit message:send with { channelId, body, parentId?, attachments? }. The REST and socket paths behave identically.",
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
          path: "/api/channels/:id/messages",
          desc: "Send a message to a channel or DM (:id is its id). Body: { body, parentId?, attachments? }. parentId posts a thread reply.",
          curl: `curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/messages \\
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
      ],
    },
    {
      title: "Automation",
      note: "Use these for CI/CD status messages. externalKey updates the same logical message; Idempotency-Key dedupes retries; threadKey groups related updates in one thread.",
      endpoints: [
        {
          method: "POST",
          path: "/api/messages/upsert",
          desc: "Create or update a structured CI/CD message by channelId or channelName. Body supports { body/text, status, title, fields, externalKey, idempotencyKey, threadKey }.",
          curl: `curl -X POST ${ORIGIN}/api/messages/upsert \\
  ${auth} \\
  ${json} \\
  -H "Idempotency-Key: github-run-123-attempt-1" \\
  -d '{"channelName":"deploys","externalKey":"github:repo:run-123","status":"running","title":"Deploy started","fields":{"branch":"main","sha":"abc123"}}'`,
        },
        {
          method: "POST",
          path: "/api/messages/upsert",
          desc: "Update the same CI/CD message later by reusing externalKey.",
          curl: `curl -X POST ${ORIGIN}/api/messages/upsert \\
  ${auth} \\
  ${json} \\
  -d '{"channelName":"deploys","externalKey":"github:repo:run-123","status":"success","title":"Deploy passed","fields":{"duration":"4m 12s"}}'`,
        },
        {
          method: "POST",
          path: "/api/messages/upsert",
          desc: "Post related updates under a thread root by using threadKey. Use a different externalKey for each thread reply you want to upsert.",
          curl: `curl -X POST ${ORIGIN}/api/messages/upsert \\
  ${auth} \\
  ${json} \\
  -d '{"channelName":"deploys","threadKey":"github:repo:run-123","externalKey":"github:repo:run-123:test","status":"failed","title":"Tests failed","body":"See artifact logs for details."}'`,
        },
      ],
    },
    {
      title: "Webhooks",
      note: "Incoming webhook URLs are ideal for CI secret managers because the posting URL carries its own token and does not need a Bearer token.",
      endpoints: [
        {
          method: "POST",
          path: "/api/webhooks",
          desc: "Create an incoming webhook for a channel. The response returns { token, path } once — store it as a CI secret.",
          curl: `curl -X POST ${ORIGIN}/api/webhooks \\
  ${auth} \\
  ${json} \\
  -d '{"name":"GitHub deploys","channelName":"deploys"}'`,
        },
        {
          method: "GET",
          path: "/api/webhooks",
          desc: "List incoming webhooks you created.",
          curl: `curl ${ORIGIN}/api/webhooks \\
  ${auth}`,
        },
        {
          method: "POST",
          path: "/api/webhooks/:token",
          desc: "Post a CI/CD message through an incoming webhook. No Authorization header is needed.",
          curl: `curl -X POST ${ORIGIN}/api/webhooks/WEBHOOK_TOKEN \\
  ${json} \\
  -H "Idempotency-Key: github-run-123-attempt-1" \\
  -d '{"externalKey":"github:repo:run-123","status":"failed","title":"Deploy failed","fields":{"branch":"main","sha":"abc123"}}'`,
        },
        {
          method: "DELETE",
          path: "/api/webhooks/:id",
          desc: "Revoke a webhook by id.",
          curl: `curl -X DELETE ${ORIGIN}/api/webhooks/WEBHOOK_ID \\
  ${auth}`,
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
          path: "/api/channels/:id/messages",
          desc: "Send a message WITH a file — upload it first, then include the returned attachment object(s) in \"attachments\".",
          curl: `# 1) upload the file → grab its "attachments" array
curl -s -X POST ${ORIGIN}/api/uploads \\
  ${auth} \\
  -F "files=@/path/to/file.png"
# → { "attachments": [ { "key": "...", "name": "file.png", "contentType": "image/png", "isImage": true } ] }

# 2) send a message that includes it
curl -X POST ${ORIGIN}/api/channels/CHANNEL_ID/messages \\
  ${auth} \\
  ${json} \\
  -d '{"body":"See attached","attachments":[{"key":"UPLOADED_KEY","name":"file.png","contentType":"image/png","isImage":true}]}'`,
        },
      ],
    },
  ];
}

export default function ApiDocsPage({ onClose }) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());

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

  return (
    <div className="settings-page api-page">
      <header className="settings-page-head">
        <h2>API reference</h2>
        <button className="settings-close" onClick={onClose} aria-label="Close API reference">
          ✕
        </button>
      </header>

      <div className="settings-page-body">
        <div className="api-inner">
          {/* Token generation lives in its own panel above the columns, so
              generating a token doesn't reflow/shift the endpoint cards. */}
          <section className="settings-section api-token-panel">
            <h3>Your API token</h3>
            <p className="settings-hint">
              Bearer token for the REST API at <code>{ORIGIN}/api</code>. Every curl below includes
              it. Valid for one year — keep it secret.
            </p>
            {token ? (
              <div className="token-box">
                <code className="token-value">{token}</code>
                <button type="button" className="btn-secondary" onClick={() => copy(token, "token")}>
                  {copied === "token" ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary" disabled={busy} onClick={generate}>
                {busy ? "Generating…" : "Generate API token"}
              </button>
            )}
            {error && <div className="error">{error}</div>}
            {!token && (
              <p className="settings-hint api-token-hint">
                Until you generate one, the curls below use a <code>YOUR_API_TOKEN</code>
                placeholder.
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
                              {copied === k ? "Copied!" : "Copy curl command"}
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
      </div>
    </div>
  );
}
