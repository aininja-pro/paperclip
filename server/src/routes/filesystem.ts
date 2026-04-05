import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function filesystemRoutes() {
  const router = Router();

  // List directories at a given path (for folder picker)
  router.get("/filesystem/browse", async (req, res) => {
    const dirPath = (req.query.path as string) || os.homedir();

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        current: dirPath,
        parent: path.dirname(dirPath),
        directories: dirs,
      });
    } catch {
      res.status(400).json({ error: "Cannot read directory", path: dirPath });
    }
  });

  return router;
}
