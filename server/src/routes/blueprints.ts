import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { projects } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { blueprintService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function blueprintRoutes(db: Db) {
  const router = Router();
  const svc = blueprintService(db);

  // Helper: get companyId from projectId
  async function getCompanyIdForProject(projectId: string): Promise<string | null> {
    const [project] = await db.select({ companyId: projects.companyId }).from(projects).where(eq(projects.id, projectId));
    return project?.companyId ?? null;
  }

  // List blueprints for a company
  router.get("/companies/:companyId/blueprints", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.listByCompany(companyId);
    res.json(result);
  });

  // List blueprints for a project
  router.get("/projects/:projectId/blueprints", async (req, res) => {
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

  // Get single blueprint
  router.get("/blueprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const blueprint = await svc.getById(id);
    if (!blueprint) {
      res.status(404).json({ error: "Blueprint not found" });
      return;
    }
    const companyId = await getCompanyIdForProject(blueprint.projectId);
    if (companyId) assertCompanyAccess(req, companyId);
    res.json(blueprint);
  });

  // Create blueprint
  router.post("/projects/:projectId/blueprints", async (req, res) => {
    const projectId = req.params.projectId as string;
    const companyId = await getCompanyIdForProject(projectId);
    if (!companyId) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const blueprint = await svc.create({ ...req.body, projectId });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "blueprint.created",
      entityType: "blueprint",
      entityId: blueprint.id,
      details: { title: blueprint.title },
    });

    res.status(201).json(blueprint);
  });

  // Update blueprint
  router.patch("/blueprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Blueprint not found" });
      return;
    }
    const companyId = await getCompanyIdForProject(existing.projectId);
    if (companyId) assertCompanyAccess(req, companyId);

    const blueprint = await svc.update(id, req.body);
    if (!blueprint) {
      res.status(404).json({ error: "Blueprint not found" });
      return;
    }

    if (companyId) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "blueprint.updated",
        entityType: "blueprint",
        entityId: id,
        details: req.body,
      });
    }

    res.json(blueprint);
  });

  // Delete blueprint
  router.delete("/blueprints/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Blueprint not found" });
      return;
    }
    const companyId = await getCompanyIdForProject(existing.projectId);
    if (companyId) assertCompanyAccess(req, companyId);

    await svc.remove(id);

    if (companyId) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "blueprint.deleted",
        entityType: "blueprint",
        entityId: id,
      });
    }

    res.json({ ok: true });
  });

  return router;
}
