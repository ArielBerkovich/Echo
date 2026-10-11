import { SUMMARY_PROMPT_PREFIX } from "../services/summaryPrompt.js";
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { AISettings, aiSettingsUpdate, publicAISettings } from "../services/aiSettings.js";

export const aiRouter = Router();
aiRouter.use(requireAuth, requireAdmin);
aiRouter.get("/", async (_req, res) => {
  res.json({ promptPrefix: SUMMARY_PROMPT_PREFIX, integration: publicAISettings(await AISettings.findById("ai").lean()) });
});
aiRouter.put("/", async (req, res) => {
  let update;
  try { update = aiSettingsUpdate(req.body); }
  catch (error) { return res.status(400).json({ error: error.issues?.map(issue => issue.message).join("; ") || "Invalid AI settings" }); }
  const doc = await AISettings.findOneAndUpdate({ _id: "ai" }, { $set: update }, { upsert: true, new: true, runValidators: true });
  res.json({ promptPrefix: SUMMARY_PROMPT_PREFIX, integration: publicAISettings(doc) });
});
