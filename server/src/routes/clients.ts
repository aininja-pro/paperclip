import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { clientService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function clientRoutes(db: Db) {
  const router = Router();
  const svc = clientService(db);

  // List clients for a company
  router.get("/companies/:companyId/clients", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  // Get single client
  router.get("/clients/:id", async (req, res) => {
    const id = req.params.id as string;
    const client = await svc.getById(id);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    assertCompanyAccess(req, client.companyId);
    res.json(client);
  });

  // Create client
  router.post("/companies/:companyId/clients", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const client = await svc.create(companyId, req.body);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "client.created",
      entityType: "client",
      entityId: client.id,
      details: { name: client.name },
    });

    res.status(201).json(client);
  });

  // Update client
  router.patch("/clients/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const client = await svc.update(id, req.body);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "client.updated",
      entityType: "client",
      entityId: id,
      details: req.body,
    });

    res.json(client);
  });

  // Delete client
  router.delete("/clients/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    await svc.remove(id);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "client.deleted",
      entityType: "client",
      entityId: id,
    });

    res.json({ ok: true });
  });

  return router;
}
