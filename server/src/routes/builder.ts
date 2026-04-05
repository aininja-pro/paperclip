import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { projects } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import type { BuilderService } from "../services/builder.js";
import { logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function builderRoutes(db: Db, builder: BuilderService) {
  const router = Router();

  async function getCompanyIdForProject(projectId: string): Promise<string | null> {
    const [project] = await db
      .select({ companyId: projects.companyId })
      .from(projects)
      .where(eq(projects.id, projectId));
    return project?.companyId ?? null;
  }

  // Start a build
  router.post(
    "/companies/:companyId/projects/:projectId/build",
    async (req, res) => {
      const { companyId, projectId } = req.params;
      assertCompanyAccess(req, companyId);

      const { blueprintId } = req.body as { blueprintId: string };
      if (!blueprintId) {
        res.status(400).json({ error: "blueprintId is required" });
        return;
      }

      try {
        const result = await builder.startBuild(projectId, blueprintId);

        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          action: "build.started",
          entityType: "session",
          entityId: result.sessionId,
          details: { projectId, blueprintId },
        });

        res.status(201).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Build failed to start";
        res.status(400).json({ error: message });
      }
    },
  );

  // Get build session status
  router.get(
    "/companies/:companyId/sessions/:sessionId/status",
    async (req, res) => {
      const { companyId, sessionId } = req.params;
      assertCompanyAccess(req, companyId);

      const status = await builder.getStatus(sessionId);
      if (!status) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json(status);
    },
  );

  // Kill a running build
  router.post(
    "/companies/:companyId/sessions/:sessionId/kill",
    async (req, res) => {
      const { companyId, sessionId } = req.params;
      assertCompanyAccess(req, companyId);

      const killed = await builder.killBuild(sessionId);
      if (!killed) {
        res.status(404).json({ error: "No running build found for this session" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "build.killed",
        entityType: "session",
        entityId: sessionId,
        details: {},
      });

      res.json({ ok: true });
    },
  );

  return router;
}
