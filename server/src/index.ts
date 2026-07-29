import http from "http";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { ensureDefaultChannel } from "./seed.js";
import { attachSocket } from "./socket.js";
import { startScheduler } from "./scheduler.js";
import { ensureBucket } from "./storage.js";
import { config } from "./config.js";
import { Message } from "./models/Message.js";
import { UserAlias } from "./models/UserAlias.js";
import { MigrationIntent } from "./models/MigrationIntent.js";
import { UserMigrationAudit } from "./models/UserMigrationAudit.js";

async function start() {
  await connectDb();
  await ensureDefaultChannel();
  await ensureBucket();
  await Message.syncIndexes();
  await UserAlias.syncIndexes();
  await MigrationIntent.syncIndexes();
  await UserMigrationAudit.syncIndexes();

  const app = createApp();
  const httpServer = http.createServer(app);
  attachSocket(httpServer);
  startScheduler();

  httpServer.listen(config.port, () => {
    console.log(`Echo server listening on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
