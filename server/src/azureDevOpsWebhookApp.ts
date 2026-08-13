import express from "express";
import helmet from "helmet";
import { azureDevOpsWebhookRouter } from "./routes/azureDevOps.js";

// A deliberately narrow listener for local tunnels and firewall rules. It
// exposes only the unauthenticated Azure receiver, never Echo's normal API.
export function createAzureDevOpsWebhookApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/integrations/azure-devops", azureDevOpsWebhookRouter);
  return app;
}
