import express from "express";
import path from "node:path";

const UPDATE_MANIFEST = /^latest(?:-[a-z0-9_-]+)?\.ya?ml$/i;

export function desktopUpdatesRouter(updateDir: string) {
  const router = express.Router();

  if (!updateDir) {
    router.use((_req, res) => {
      res.status(404).json({ error: "Desktop updates are not configured" });
    });
    return router;
  }

  router.use(
    express.static(path.resolve(updateDir), {
      dotfiles: "deny",
      fallthrough: true,
      index: false,
      setHeaders(res, filePath) {
        const fileName = path.basename(filePath);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader(
          "Cache-Control",
          UPDATE_MANIFEST.test(fileName) ? "no-cache" : "public, max-age=31536000, immutable"
        );
      },
    })
  );

  router.use((_req, res) => {
    res.status(404).json({ error: "Desktop update file not found" });
  });

  return router;
}
