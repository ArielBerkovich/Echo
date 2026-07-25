import http from "http";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { ensureDefaultChannel } from "./seed.js";
import { attachSocket } from "./socket.js";
import { startScheduler } from "./scheduler.js";
import { startAdoScheduler } from "./lib/adoScheduler.js";
import { ensureAdoBotUser } from "./lib/adoBotUser.js";
import { ensureBucket } from "./storage.js";
import { config } from "./config.js";
import { Message } from "./models/Message.js";

async function start() {
  await connectDb();
  await ensureDefaultChannel();
  await ensureBucket();
  await Message.syncIndexes();
  await ensureAdoBotUser();

  const app = createApp();
  const httpServer = http.createServer(app);
  attachSocket(httpServer);
  startScheduler();
  startAdoScheduler();

  httpServer.listen(config.port, () => {
    console.log(`Echo server listening on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
