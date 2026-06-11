import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { postAutomationMessage, resolveAutomationChannel } from "../automation.js";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

// POST /api/messages/upsert
// CI/CD-friendly send/update endpoint. Use `externalKey` to update the same
// logical message, `idempotencyKey` to dedupe retries, and `threadKey` to group
// related updates under one thread root.
messagesRouter.post("/upsert", async (req, res) => {
  const channel = await resolveAutomationChannel({
    userId: req.user._id,
    channelId: req.body?.channelId,
    channelName: req.body?.channelName,
  });
  const result = await postAutomationMessage({
    channel,
    authorId: req.user._id,
    payload: req.body || {},
    idempotencyKey: req.header("Idempotency-Key"),
  });
  res.status(result.created ? 201 : 200).json(result);
});
