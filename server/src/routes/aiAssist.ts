import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getAISettings } from "../services/aiSettings.js";
import { rephraseMessage } from "../services/rephraseService.js";

export const aiAssistRouter = Router();
aiAssistRouter.use(requireAuth);

aiAssistRouter.post("/rephrase", async (req, res) => {
  const settings = await getAISettings();
  if (!settings.enabled) return res.status(404).json({ error: "not found" });
  try {
    res.json(await rephraseMessage(req.body?.text, settings));
  } catch (error) {
    console.error("AI rephrase request failed:", error.message);
    const timeout = error.name === "TimeoutError";
    res.status(error.status || (timeout ? 504 : 502)).json({ error: error.status ? error.message : timeout ? "The rephrase request timed out." : "The AI provider could not complete the rephrase request. Try again or check the provider configuration." });
  }
});
