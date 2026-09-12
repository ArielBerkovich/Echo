import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getGroup, getGroupMembers, groupDirectoryEnabled, listGroups } from "../groupDirectory.js";

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

groupsRouter.get("/", async (_req, res, next) => {
  try {
    if (!groupDirectoryEnabled()) return res.status(404).json({ error: "No group directory is enabled" });
    res.json({ groups: await listGroups() });
  } catch (error) { next(error); }
});

groupsRouter.get("/:provider/:id", async (req, res, next) => {
  try {
    if (!groupDirectoryEnabled()) return res.status(404).json({ error: "No group directory is enabled" });
    const group = await getGroup(req.params.provider, req.params.id);
    if (!group) return res.status(404).json({ error: "group not found" });
    const members = await getGroupMembers(group.provider, group.id);
    if (!members) return res.status(404).json({ error: "group not found" });
    res.json({ group, members, memberCount: members.length, echoMemberCount: members.filter((member) => member.echoUser).length });
  } catch (error) { next(error); }
});
