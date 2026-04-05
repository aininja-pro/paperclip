import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { projects, projectWorkspaces } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { assertCompanyAccess } from "./authz.js";

export function claudeMdRoutes(db: Db) {
  const router = Router();

  async function resolveProjectCwd(projectId: string): Promise<string | null> {
    const workspaces = await db
      .select()
      .from(projectWorkspaces)
      .where(eq(projectWorkspaces.projectId, projectId));
    if (workspaces.length > 0 && workspaces[0].cwd) {
      return workspaces[0].cwd;
    }
    return null;
  }

  router.get(
    "/companies/:companyId/projects/:projectId/claude-md",
    async (req, res) => {
      const { companyId, projectId } = req.params;
      assertCompanyAccess(req, companyId);

      const cwd = await resolveProjectCwd(projectId);
      if (!cwd) {
        res.json({ content: "", path: "", error: "No workspace configured for this project" });
        return;
      }

      const filePath = path.join(cwd, "CLAUDE.md");
      try {
        const content = await fs.readFile(filePath, "utf-8");
        res.json({ content, path: filePath });
      } catch {
        res.json({ content: "", path: filePath });
      }
    }
  );

  router.put(
    "/companies/:companyId/projects/:projectId/claude-md",
    async (req, res) => {
      const { companyId, projectId } = req.params;
      assertCompanyAccess(req, companyId);

      const { content } = req.body as { content: string };
      if (typeof content !== "string") {
        res.status(400).json({ error: "content must be a string" });
        return;
      }

      const cwd = await resolveProjectCwd(projectId);
      if (!cwd) {
        res.status(422).json({ error: "No workspace configured for this project" });
        return;
      }

      const filePath = path.join(cwd, "CLAUDE.md");
      await fs.writeFile(filePath, content, "utf-8");
      res.json({ ok: true, path: filePath });
    }
  );

  return router;
}
