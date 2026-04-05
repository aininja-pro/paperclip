import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { blueprints, projects } from "@paperclipai/db";

export function blueprintService(db: Db) {
  return {
    listByProject: (projectId: string) =>
      db.select().from(blueprints).where(eq(blueprints.projectId, projectId)),

    listByCompany: async (companyId: string) => {
      const companyProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.companyId, companyId));
      if (companyProjects.length === 0) return [];
      const projectIds = companyProjects.map((p) => p.id);
      const { inArray } = await import("drizzle-orm");
      return db.select().from(blueprints).where(inArray(blueprints.projectId, projectIds));
    },

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(blueprints)
        .where(eq(blueprints.id, id))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    create: async (data: {
      projectId: string;
      title: string;
      filename: string;
      status?: string;
    }) => {
      const [created] = await db
        .insert(blueprints)
        .values({
          projectId: data.projectId,
          title: data.title,
          filename: data.filename,
          status: data.status ?? "draft",
        })
        .returning();
      return created;
    },

    update: async (
      id: string,
      data: Partial<{ title: string; filename: string; status: string; approvedAt: Date | null; builtAt: Date | null }>,
    ) => {
      const [updated] = await db
        .update(blueprints)
        .set(data)
        .where(eq(blueprints.id, id))
        .returning();
      return updated ?? null;
    },

    remove: async (id: string) => {
      const [deleted] = await db
        .delete(blueprints)
        .where(eq(blueprints.id, id))
        .returning();
      return deleted ?? null;
    },
  };
}
