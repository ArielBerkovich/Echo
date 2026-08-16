import express from "express";
import fs from "node:fs";
import path from "node:path";

const UPDATE_MANIFEST = /^latest(?:-[a-z0-9_-]+)?\.ya?ml$/i;
const DESKTOP_ARTIFACT = /\.(?:exe|AppImage)$/i;

function artifactFromManifest(updateDir: string, platform: string, manifestName: string) {
  try {
    const manifestPath = path.join(updateDir, platform, manifestName);
    const manifest = fs.readFileSync(manifestPath, "utf8");
    const version = manifest.match(/^version:\s*(.+)$/m)?.[1]?.trim() || null;
    const fileName = manifest.match(/^\s*-\s*url:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
    if (!fileName || !DESKTOP_ARTIFACT.test(fileName) || path.basename(fileName) !== fileName) {
      return { available: false, version };
    }
    return {
      available: true,
      version,
      url: `/api/desktop-updates/${platform}/${encodeURIComponent(fileName)}`,
    };
  } catch {
    return { available: false, version: null };
  }
}

export function desktopDownloadsRouter(updateDir: string) {
  const router = express.Router();
  router.get("/", (_req, res) => {
    if (!updateDir) {
      res.json({ version: null, windows: { available: false }, linux: { available: false } });
      return;
    }
    const windows = artifactFromManifest(updateDir, "windows", "latest.yml");
    const linux = artifactFromManifest(updateDir, "linux", "latest-linux.yml");
    res.json({ version: windows.version || linux.version || null, windows, linux });
  });
  return router;
}

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
