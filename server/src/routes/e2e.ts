import { Router } from "express";
import { resetE2EAuthFixture, resetE2EWorkspaceFixture } from "../e2e.js";

export const e2eRouter = Router();

function tokenOk(req) {
  return !!process.env.E2E_RESET_TOKEN && req.get("x-e2e-reset-token") === process.env.E2E_RESET_TOKEN;
}

e2eRouter.post("/reset", async (req, res) => {
  if (!process.env.E2E_RESET_TOKEN) {
    return res.status(404).json({ error: "not found" });
  }
  if (!tokenOk(req)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const scenario = String(req.body?.scenario || "");
  if (scenario === "auth") {
    await resetE2EAuthFixture();
    return res.json({ ok: true, scenario });
  }
  if (scenario === "workspace") {
    await resetE2EWorkspaceFixture();
    return res.json({ ok: true, scenario });
  }
  return res.status(400).json({ error: "scenario must be auth or workspace" });
});
