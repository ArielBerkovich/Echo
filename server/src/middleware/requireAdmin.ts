// Express middleware: gate a route to the workspace admin. Must run after
// requireAuth (which attaches req.user).
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "admin only" });
  }
  next();
}
