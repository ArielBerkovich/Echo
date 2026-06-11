import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { io } from "socket.io-client";

const require = createRequire(import.meta.url);
const jwt = require("../../server/node_modules/jsonwebtoken");

const BASE_URL = process.env.BASE_URL || "http://localhost:8090";
const USERS = Number(process.env.USERS || 200);
const SOCKET_MESSAGES = Number(process.env.SOCKET_MESSAGES || 100);
const REST_MESSAGES = Number(process.env.REST_MESSAGES || 50);
const RATE_PER_SEC = Number(process.env.RATE_PER_SEC || 10);
const SEED_MESSAGES = Number(process.env.SEED_MESSAGES || 100000);
const PASSWORD = "Loadtest1";
const RUN = process.env.LOAD_RUN || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
const CHANNEL_NAME = `lt-${RUN}`;
const REPO_ROOT = new URL("../../", import.meta.url).pathname;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summary(values) {
  return {
    count: values.length,
    min: Math.round(Math.min(...values)),
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    p99: Math.round(percentile(values, 99)),
    max: Math.round(Math.max(...values)),
  };
}

async function request(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${data.error || res.statusText}`);
  }
  return data;
}

async function registerOrLogin(i) {
  const n = String(i).padStart(3, "0");
  const username = `lt_user_${n}`;
  const payload = { username, displayName: `Load User ${n}`, password: PASSWORD };
  try {
    return await request("/auth/register", { method: "POST", body: payload });
  } catch (err) {
    if (!/already taken/.test(err.message)) throw err;
    return request("/auth/login", { method: "POST", body: { username, password: PASSWORD } });
  }
}

async function timed(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${Math.round(ms)}ms`);
  return { result, ms };
}

async function setupUsers() {
  if (process.env.SETUP_VIA_API === "1") {
    const users = [];
    const tokens = [];
    const batchSize = 10;
    for (let start = 0; start < USERS; start += batchSize) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(batchSize, USERS - start) }, (_, idx) => registerOrLogin(start + idx))
      );
      for (const item of batch) {
        users.push(item.user);
        tokens.push(item.token);
      }
      process.stdout.write(".");
    }
    process.stdout.write("\n");
    return { users, tokens };
  }

  const jwtSecret = process.env.JWT_SECRET || execFileSync("docker-compose", ["exec", "-T", "server", "printenv", "JWT_SECRET"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
  const js = `
const total = ${USERS};
for (let i = 0; i < total; i++) {
  const n = String(i).padStart(3, "0");
  db.users.updateOne(
    { username: "lt_user_" + n },
    {
      $setOnInsert: {
        username: "lt_user_" + n,
        displayName: "Load User " + n,
        passwordHash: "load-test-only",
        isAdmin: false,
        mustResetPassword: false,
        tokenVersion: 0,
        onboarded: true,
        activitySeenAt: null,
        savedMessages: [],
        vips: [],
        createdAt: new Date()
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}
const users = db.users.find({ username: /^lt_user_/ }).sort({ username: 1 }).limit(total).toArray()
  .map((u) => ({ id: u._id.toString(), username: u.username, displayName: u.displayName, tokenVersion: u.tokenVersion || 0 }));
print(JSON.stringify(users));
`;
  const out = execFileSync("docker-compose", ["exec", "-T", "mongo", "mongosh", "echo", "--quiet", "--eval", js], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  const users = JSON.parse(out.trim().split("\n").at(-1));
  if (users.length < USERS) throw new Error(`expected ${USERS} load users, got ${users.length}`);
  const tokens = users.map((u) =>
    jwt.sign({ sub: u.id, tv: u.tokenVersion || 0 }, jwtSecret, { expiresIn: "7d" })
  );
  return { users, tokens };
}

async function setupChannel(token, tokens) {
  let channel;
  try {
    channel = (await request("/channels", {
      method: "POST",
      token,
      body: { name: CHANNEL_NAME, type: "public" },
    })).channel;
  } catch (err) {
    if (!/already exists/.test(err.message)) throw err;
    channel = (await request(`/channels/by-name/${CHANNEL_NAME}`, { token })).channel;
  }

  const batchSize = 25;
  for (let start = 0; start < tokens.length; start += batchSize) {
    await Promise.all(
      tokens.slice(start, start + batchSize).map((t) =>
        request(`/channels/${channel.id}/join`, { method: "POST", token: t }).catch((err) => {
          if (!/channel not found/.test(err.message)) throw err;
        })
      )
    );
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  return channel;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = io(BASE_URL, {
      auth: { token },
      timeout: 10000,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("socket connect timeout"));
    }, 12000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve({ socket, ms: performance.now() - start });
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(err);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    socket.timeout(10000).emit(event, payload, (err, res) => {
      if (err) return reject(err);
      if (res?.error) return reject(new Error(res.error));
      resolve({ res, ms: performance.now() - start });
    });
  });
}

async function connectSockets(tokens, channelId) {
  const sockets = [];
  const connectMs = [];
  const batchSize = 25;
  for (let start = 0; start < tokens.length; start += batchSize) {
    const batch = await Promise.all(tokens.slice(start, start + batchSize).map(connectSocket));
    for (const item of batch) {
      sockets.push(item.socket);
      connectMs.push(item.ms);
    }
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  await Promise.all(sockets.map((socket) => emitAck(socket, "channel:join", channelId)));
  return { sockets, connectMs };
}

async function runSocketBroadcast(sockets, channelId) {
  const prefix = `[loadtest socket ${RUN}]`;
  let received = 0;
  const expected = sockets.length * SOCKET_MESSAGES;
  const ackMs = [];
  for (const socket of sockets) {
    socket.on("message:new", (msg) => {
      if (msg?.body?.startsWith(prefix)) received++;
    });
  }

  const waitMs = Math.max(1, Math.floor(1000 / RATE_PER_SEC));
  const started = performance.now();
  for (let i = 0; i < SOCKET_MESSAGES; i++) {
    const sender = sockets[i % sockets.length];
    const { ms } = await emitAck(sender, "message:send", {
      channelId,
      body: `${prefix} message ${i}`,
    });
    ackMs.push(ms);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const deadline = performance.now() + 30000;
  while (received < expected && performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    ackMs,
    received,
    expected,
    durationMs: performance.now() - started,
  };
}

async function runRestSends(tokens, channelId) {
  const prefix = `[loadtest rest ${RUN}]`;
  const latencies = [];
  const waitMs = Math.max(1, Math.floor(1000 / RATE_PER_SEC));
  for (let i = 0; i < REST_MESSAGES; i++) {
    const token = tokens[i % tokens.length];
    const start = performance.now();
    await request(`/channels/${channelId}/messages`, {
      method: "POST",
      token,
      headers: { "Idempotency-Key": `${RUN}-rest-${i}` },
      body: { body: `${prefix} message ${i}` },
    });
    latencies.push(performance.now() - start);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return latencies;
}

function seedBulkMessages({ channelId, userIds, savedUserId }) {
  if (SEED_MESSAGES <= 0) return { inserted: 0 };
  const js = `
const channelId = ObjectId(${JSON.stringify(channelId)});
const authorIds = ${JSON.stringify(userIds)}.map((id) => ObjectId(id));
const savedUserId = ObjectId(${JSON.stringify(savedUserId)});
const total = ${SEED_MESSAGES};
db.messages.deleteMany({ channel: channelId, body: /^\\\\[loadtest bulk ${RUN}\\\\]/ });
const savedIds = [];
let inserted = 0;
for (let start = 0; start < total; start += 1000) {
  const docs = [];
  for (let i = start; i < Math.min(total, start + 1000); i++) {
    const id = new ObjectId();
    if (savedIds.length < 25) savedIds.push(id);
    const mention = i % 250 === 0 ? " @lt_user_000" : "";
    const link = i % 200 === 0 ? " https://example.com/artifact/" + i : "";
    const mentionedUserIds = mention ? [savedUserId] : [];
    docs.push({
      _id: id,
      channel: channelId,
      author: authorIds[i % authorIds.length],
      body: "[loadtest bulk ${RUN}] loadneedle message " + i + mention + link,
      attachments: i % 500 === 0 ? [{ key: "load-" + i + ".txt", name: "load-" + i + ".txt", size: 12, contentType: "text/plain", isImage: false }] : [],
      kind: "user",
      parentId: null,
      mentionedUserIds,
      mentionsEveryone: false,
      threadRootAuthor: null,
      editedAt: null,
      forwardedFrom: null,
      pinnedAt: null,
      pinnedBy: null,
      reactions: [],
      createdAt: new Date(Date.now() - (total - i) * 1000),
      updatedAt: new Date(),
    });
  }
  db.messages.insertMany(docs, { ordered: false });
  inserted += docs.length;
}
db.users.updateOne({ _id: savedUserId }, { $set: { savedMessages: savedIds } });
printjson({ inserted, saved: savedIds.length });
`;
  const out = execFileSync("docker-compose", ["exec", "-T", "mongo", "mongosh", "echo", "--quiet", "--eval", js], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  return out.trim();
}

async function runQueries(token) {
  const tests = [
    ["history newest page", () => request(`/channels/by-name/${CHANNEL_NAME}`, { token }).then(({ channel }) => request(`/channels/${channel.id}/messages`, { token }))],
    ["search loadneedle", () => request(`/search/messages?q=${encodeURIComponent(`loadneedle in:${CHANNEL_NAME}`)}`, { token })],
    ["search link filter", () => request(`/search/messages?q=${encodeURIComponent(`loadneedle in:${CHANNEL_NAME} has:link`)}`, { token })],
    ["activity mentions", () => request("/activity", { token })],
    ["saved feed", () => request("/saved", { token })],
  ];
  const results = [];
  for (const [label, fn] of tests) {
    const latencies = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await fn();
      latencies.push(performance.now() - start);
    }
    results.push([label, summary(latencies)]);
  }
  return results;
}

async function main() {
  console.log(`Target: ${BASE_URL}`);
  console.log(`Users=${USERS}, socketMessages=${SOCKET_MESSAGES}, restMessages=${REST_MESSAGES}, rate=${RATE_PER_SEC}/s, seedMessages=${SEED_MESSAGES}`);
  console.log(`Run=${RUN}, channel=#${CHANNEL_NAME}`);

  const { result: setup, ms: setupMs } = await timed("setup users", setupUsers);
  const { users, tokens } = setup;
  const { result: channel } = await timed("setup channel and memberships", () => setupChannel(tokens[0], tokens));

  const { result: socketSetup } = await timed("connect sockets", () => connectSockets(tokens, channel.id));
  console.log("socket connect latency ms:", summary(socketSetup.connectMs));

  const socketResult = await timed("socket broadcast test", () => runSocketBroadcast(socketSetup.sockets, channel.id));
  console.log("socket send ack latency ms:", summary(socketResult.result.ackMs));
  console.log(`socket deliveries: ${socketResult.result.received}/${socketResult.result.expected}`);

  const restLatencies = await timed("REST send test", () => runRestSends(tokens, channel.id));
  console.log("REST send latency ms:", summary(restLatencies.result));

  const seedResult = await timed("bulk seed query dataset", async () =>
    seedBulkMessages({ channelId: channel.id, userIds: users.map((u) => u.id), savedUserId: users[0].id })
  );
  console.log("seed result:", seedResult.result);

  const queryResults = await timed("query tests", () => runQueries(tokens[0]));
  for (const [label, stats] of queryResults.result) {
    console.log(`${label} latency ms:`, stats);
  }

  socketSetup.sockets.forEach((socket) => socket.disconnect());
  console.log(`Total setup+test time: ${Math.round(setupMs + socketResult.ms + restLatencies.ms + seedResult.ms + queryResults.ms)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
