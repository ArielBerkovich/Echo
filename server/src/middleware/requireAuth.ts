import { verifyToken } from "../auth.js";
import { User } from "../models/User.js";
import { ensureActivityReadBaseline } from "../lib/activityReadBaseline.js";

// Express middleware: validates the Bearer token and attaches req.user.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Token has been invalidated" });
    }
    await ensureActivityReadBaseline(user);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
