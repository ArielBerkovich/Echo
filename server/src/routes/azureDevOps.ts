import { Router } from "express";
import { AzureDevOpsIntegration } from "../models/AzureDevOpsIntegration.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  createAzureDevOpsToken,
  encryptAzureDevOpsToken,
  findAzureDevOpsIntegration,
  hashAzureDevOpsToken,
  integrationEndpointPath,
  processAzureDevOpsEvent,
  decryptAzureDevOpsToken,
} from "../azureDevOps.js";

export const azureDevOpsWebhookRouter = Router();

// Azure DevOps calls this endpoint without an Echo login.
azureDevOpsWebhookRouter.post("/:token", async (req, res) => {
  const integration = await findAzureDevOpsIntegration(req.params.token);
  if (!integration) return res.status(404).json({ error: "integration not found" });
  try {
    const result = await processAzureDevOpsEvent(integration, req.body || {});
    res.status(result.duplicate ? 200 : 202).json(result);
  } catch (error) {
    await AzureDevOpsIntegration.updateOne(
      { _id: integration._id },
      { $set: { lastError: String(error?.message || "event processing failed").slice(0, 500) } }
    );
    throw error;
  }
});

export const azureDevOpsRouter = Router();
azureDevOpsRouter.use(azureDevOpsWebhookRouter);
azureDevOpsRouter.use(requireAuth, requireAdmin);

azureDevOpsRouter.get("/", async (_req, res) => {
  // Azure DevOps is a single app-level integration. Keep older records hidden
  // from the settings UI while allowing their existing webhook tokens to be
  // handled by the receiver during migration.
  const integrations = await AzureDevOpsIntegration.find().sort({ createdAt: -1 }).limit(1);
  res.json({
    integrations: integrations.map((item) => {
      const token = decryptAzureDevOpsToken(item.tokenCiphertext);
      return {
        ...item.toPublicJSON(),
        endpoint: token ? integrationEndpointPath(token) : null,
      };
    }),
  });
});

azureDevOpsRouter.post("/", async (req, res) => {
  const existing = await AzureDevOpsIntegration.findOne().sort({ createdAt: -1 });
  if (existing) return res.status(409).json({ error: "Azure DevOps is already configured" });
  const name = String(req.body?.name || "Azure DevOps").trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ error: "name is required and must be at most 80 characters" });
  }
  const token = createAzureDevOpsToken();
  const integration = await AzureDevOpsIntegration.create({
    name,
    tokenHash: hashAzureDevOpsToken(token),
    tokenCiphertext: encryptAzureDevOpsToken(token),
    createdBy: req.user._id,
    notify: req.body?.notify || {},
  });
  res.status(201).json({
    integration: integration.toPublicJSON(),
    token,
    endpointPath: integrationEndpointPath(token),
  });
});

azureDevOpsRouter.post("/:id/token", async (req, res) => {
  const integration = await AzureDevOpsIntegration.findById(req.params.id);
  if (!integration) return res.status(404).json({ error: "integration not found" });
  const token = createAzureDevOpsToken();
  integration.tokenHash = hashAzureDevOpsToken(token);
  integration.tokenCiphertext = encryptAzureDevOpsToken(token);
  await integration.save();
  res.json({ endpoint: integrationEndpointPath(token), token });
});

azureDevOpsRouter.patch("/:id", async (req, res) => {
  const integration = await AzureDevOpsIntegration.findById(req.params.id);
  if (!integration) return res.status(404).json({ error: "integration not found" });
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "invalid integration name" });
    integration.name = name;
  }
  if (req.body?.active !== undefined) integration.active = !!req.body.active;
  if (req.body?.notify && typeof req.body.notify === "object") {
    for (const key of [
      "pullRequestCreated",
      "pullRequestApproved",
      "pullRequestCompleted",
      "pullRequestAbandoned",
      "pullRequestReactivated",
      "buildValidationFailed",
      "buildValidationSucceeded",
    ]) {
      if (req.body.notify[key] !== undefined) integration.notify[key] = !!req.body.notify[key];
    }
  }
  await integration.save();
  res.json({ integration: integration.toPublicJSON() });
});

azureDevOpsRouter.delete("/:id", async (req, res) => {
  const deleted = await AzureDevOpsIntegration.deleteOne({ _id: req.params.id });
  if (!deleted.deletedCount) return res.status(404).json({ error: "integration not found" });
  res.json({ ok: true });
});
