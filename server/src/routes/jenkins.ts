import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();
const pluginPath = process.env.JENKINS_PLUGIN_PATH || path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../jenkins-plugin/echo-notifier.hpi"
);

router.get("/download", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    await fs.promises.access(pluginPath, fs.constants.R_OK);
    res.download(pluginPath, "echo-notifier.hpi", {
      headers: {
        "Content-Type": "application/java-archive",
      },
    }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch {
    res.status(503).json({ error: "Jenkins plugin is not available in this Echo image" });
  }
});

export const jenkinsRouter = router;
