import { Router } from "express";
import { IncomingWebhook } from "../models/IncomingWebhook.js";
import { hashWebhookToken, postAutomationMessage, resolveAutomationChannel } from "../automation.js";
import { buildJenkinsAutomationPayload } from "../jenkins.js";

export const jenkinsRouter = Router();

// POST /api/integrations/jenkins/:token
// Accepts a Jenkins Pipeline REST API (`wfapi/describe`) response wrapped with
// job metadata. The existing incoming-webhook token fixes the destination and
// means Jenkins does not need a user's long-lived Echo API token.
jenkinsRouter.post("/:token", async (req, res) => {
  const tokenHash = hashWebhookToken(req.params.token);
  const hook = await IncomingWebhook.findOne({ tokenHash, active: true });
  if (!hook) return res.status(404).json({ error: "integration not found" });

  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    !String(body.jobName || "").trim() ||
    body.buildNumber === undefined ||
    !body.pipeline ||
    typeof body.pipeline !== "object" ||
    Array.isArray(body.pipeline)
  ) {
    return res.status(400).json({
      error: "jobName, buildNumber, and a pipeline object from wfapi/describe are required",
    });
  }

  const channel = await resolveAutomationChannel({
    userId: hook.createdBy,
    fallbackChannelId: hook.channel,
  });
  const payload = buildJenkinsAutomationPayload(body);
  const result = await postAutomationMessage({
    channel,
    authorId: hook.createdBy,
    payload,
    source: "jenkins",
    idempotencyKey: req.header("Idempotency-Key"),
  });
  res.status(result.created ? 201 : 200).json({ ...result, report: payload.report });
});
