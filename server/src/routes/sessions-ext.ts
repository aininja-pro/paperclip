import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { projects } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { sessionExtService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function sessionExtRoutes(db: Db) {
  const router = Router();
  const svc = sessionExtService(db);

  async function getCompanyIdForProject(projectId: string): Promise<string | null> {
    const [project] = await db.select({ companyId: projects.companyId }).from(projects).where(eq(projects.id, projectId));
    return project?.companyId ?? null;
  }

  // List sessions for a company
  router.get("/companies/:companyId/sessions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.listByCompany(companyId);
    res.json(result);
  });

  // List sessions for a project
  router.get("/projects/:projectId/sessions", async (req, res) => {
    const projectId = req.params.projectId as string;
    const companyId = await getCompanyIdForProject(projectId);
    if (!companyId) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const result = await svc.listByProject(projectId);
    res.json(result);
  });

  // Get single session
  router.get("/sessions/:id", async (req, res) => {
    const id = req.params.id as string;
    const session = await svc.getById(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const companyId = await getCompanyIdForProject(session.projectId);
    if (companyId) assertCompanyAccess(req, companyId);
    res.json(session);
  });

  // Create session
  router.post("/projects/:projectId/sessions", async (req, res) => {
    const projectId = req.params.projectId as string;
    const companyId = await getCompanyIdForProject(projectId);
    if (!companyId) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const session = await svc.create({ ...req.body, projectId });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "session.created",
      entityType: "session",
      entityId: session.id,
      details: { agentType: session.agentType },
    });

    res.status(201).json(session);
  });

  // Update session
  router.patch("/sessions/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const companyId = await getCompanyIdForProject(existing.projectId);
    if (companyId) assertCompanyAccess(req, companyId);

    const session = await svc.update(id, req.body);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (companyId) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "session.updated",
        entityType: "session",
        entityId: id,
        details: req.body,
      });
    }

    res.json(session);
  });

  return router;
}
