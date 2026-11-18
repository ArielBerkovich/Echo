import http from "http";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { ensureDefaultChannel } from "./seed.js";
import { attachSocket } from "./socket.js";
import { startScheduler } from "./scheduler.js";
import { ensureBucket } from "./storage.js";
import { config } from "./config.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import { UserAlias } from "./models/UserAlias.js";
import { MigrationIntent } from "./models/MigrationIntent.js";
import { UserMigrationAudit } from "./models/UserMigrationAudit.js";
import { createMetricsApp } from "./metrics.js";

async function start() {
  await connectDb();
  await ensureDefaultChannel();
  await ensureBucket();
  // Remove the legacy identity constraint; RHSSO accounts are keyed by username.
  try {
    await User.collection.dropIndex("rhssoIssuer_1_rhssoSubject_1");
  } catch (error) {
    if (error.code !== 27 && error.code !== 26) throw error;
  }
  await Message.syncIndexes();
  await UserAlias.syncIndexes();
  await MigrationIntent.syncIndexes();
  await UserMigrationAudit.syncIndexes();

  const app = createApp();
  const httpServer = http.createServer(app);
  const metricsServer = http.createServer(createMetricsApp());
  attachSocket(httpServer);
  startScheduler();

  httpServer.listen(config.port, () => {
    console.log(`Echo server listening on port ${config.port}`);
  });
  metricsServer.listen(config.metricsPort, () => {
    console.log(`Echo metrics listening on port ${config.metricsPort}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
