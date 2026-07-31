import { Router } from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { FILE_CATEGORY, setFileCategory } from "../storage.js";

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);

function brandingFromAdmin(admin) {
  return {
    enabled: !!admin?.organizationBrandingEnabled,
    name: admin?.organizationName || "Echo",
    imageUrl: admin?.organizationImageKey ? `/api/files/${admin.organizationImageKey}` : null,
  };
}

// GET /api/workspace/branding — shared primary-navigation branding.
workspaceRouter.get("/branding", async (_req, res) => {
  const admin = await User.findOne({ isAdmin: true }).select(
    "organizationName organizationImageKey organizationBrandingEnabled"
  );
  res.json({ branding: brandingFromAdmin(admin) });
});

// PATCH /api/workspace/branding — administrators configure shared branding.
workspaceRouter.patch("/branding", requireAdmin, async (req, res) => {
  const { enabled, name, imageKey } = req.body || {};
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 64)) {
    return res.status(400).json({ error: "organization name must be 1-64 characters" });
  }
  if (imageKey !== undefined && imageKey !== null && !/^[a-z0-9-]+\.[a-z0-9]+$/i.test(String(imageKey))) {
    return res.status(400).json({ error: "invalid organization image reference" });
  }

  if (enabled !== undefined) req.user.organizationBrandingEnabled = enabled;
  if (name !== undefined) req.user.organizationName = name.trim();
  if (imageKey !== undefined) req.user.organizationImageKey = imageKey;
  if (imageKey) await setFileCategory(imageKey, FILE_CATEGORY.AVATAR);
  await req.user.save();
  res.json({ branding: brandingFromAdmin(req.user) });
});
