import { Router } from "express";
import { WorkspaceSettings } from "../models/WorkspaceSettings.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { setFileCategory, FILE_CATEGORY } from "../storage.js";

export const workspaceRouter = Router();

async function getSettings() {
  return (await WorkspaceSettings.findById("workspace")) || WorkspaceSettings.create({ _id: "workspace" });
}

workspaceRouter.get("/", requireAuth, async (_req, res) => {
  const settings = await getSettings();
  res.json({ workspace: settings.toPublicJSON() });
});

workspaceRouter.patch("/", requireAuth, requireAdmin, async (req, res) => {
  const { name, logoKey } = req.body || {};
  const settings = await getSettings();

  if (name !== undefined) {
    const nextName = String(name).trim();
    if (nextName.length > 80) {
      return res.status(400).json({ error: "organization name must be at most 80 characters" });
    }
    settings.name = nextName;
  }
  if (logoKey !== undefined) {
    if (logoKey !== null && !/^[a-z0-9-]+\.[a-z0-9]+$/i.test(String(logoKey))) {
      return res.status(400).json({ error: "invalid logo reference" });
    }
    settings.logoKey = logoKey;
    if (logoKey) await setFileCategory(logoKey, FILE_CATEGORY.BRAND);
  }

  await settings.save();
  res.json({ workspace: settings.toPublicJSON() });
});
