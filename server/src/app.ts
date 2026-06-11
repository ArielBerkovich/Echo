import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { channelsRouter } from "./routes/channels.js";
import { usersRouter } from "./routes/users.js";
import { dmsRouter } from "./routes/dms.js";
import { activityRouter } from "./routes/activity.js";
import { uploadsRouter, filesRouter } from "./routes/uploads.js";
import { emojisRouter } from "./routes/emojis.js";
import { searchRouter } from "./routes/search.js";
import { scheduledRouter } from "./routes/scheduled.js";
import { adminRouter } from "./routes/admin.js";
import { savedRouter } from "./routes/saved.js";
import { messagesRouter } from "./routes/messages.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { openApiDocument } from "./openapi.js";
import { e2eRouter } from "./routes/e2e.js";

export function createApp() {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "50kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/openapi.json", (_req, res) => res.json(openApiDocument()));
  app.use("/api/auth", authRouter);
  app.use("/api/channels", channelsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/dms", dmsRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/emojis", emojisRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/scheduled", scheduledRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/saved", savedRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/webhooks", webhooksRouter);
  if (process.env.E2E_RESET_TOKEN) {
    app.use("/api/e2e", e2eRouter);
  }

  // Keep the process alive and return a consistent JSON payload on crashes.
  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = Number(err?.status) || 500;
    res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
  });

  return app;
}
