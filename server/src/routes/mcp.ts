import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { handleMcpRequest } from "../mcp.js";

export const mcpRouter = Router();

// MCP is intentionally protected at the HTTP boundary. This means clients
// need a valid Echo Bearer token even for initialize/list requests, and tool
// handlers additionally scope every read/write operation to req.user.
mcpRouter.use(requireAuth);
mcpRouter.all("/", handleMcpRequest);
