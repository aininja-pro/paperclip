import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { sessionsExt, projects } from "@paperclipai/db";
import type { SessionTestResults } from "@paperclipai/db/schema/sessions_ext";

export function sessionExtService(db: Db) {
  return {
    listByProject: (projectId: string) =>
      db.select().from(sessionsExt).where(eq(sessionsExt.projectId, projectId)),

    listByCompany: async (companyId: string) => {
      const companyProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.companyId, companyId));
      if (companyProjects.length === 0) return [];
      const projectIds = companyProjects.map((p) => p.id);
      const { inArray } = await import("drizzle-orm");
      return db.select().from(sessionsExt).where(inArray(sessionsExt.projectId, projectIds));
    },

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(sessionsExt)
        .where(eq(sessionsExt.id, id))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    create: async (data: {
      projectId: string;
      blueprintId?: string | null;
      runId?: string | null;
      agentType?: string | null;
      status?: string;
      summary?: string | null;
      filesChanged?: string[] | null;
      testResults?: SessionTestResults | null;
    }) => {
      const [created] = await db
        .insert(sessionsExt)
        .values({
          projectId: data.projectId,
          blueprintId: data.blueprintId ?? null,
          runId: data.runId ?? null,
          agentType: data.agentType ?? null,
          status: data.status ?? "running",
          summary: data.summary ?? null,
          filesChanged: data.filesChanged ?? null,
          testResults: data.testResults ?? null,
        })
        .returning();
      return created;
    },

    update: async (
      id: string,
      data: Partial<{
        status: string;
        summary: string | null;
        filesChanged: string[] | null;
        testResults: SessionTestResults | null;
        completedAt: Date | null;
        resolvedAt: Date | null;
      }>,
    ) => {
      const [updated] = await db
        .update(sessionsExt)
        .set(data)
        .where(eq(sessionsExt.id, id))
        .returning();
      return updated ?? null;
    },

    remove: async (id: string) => {
      const [deleted] = await db
        .delete(sessionsExt)
        .where(eq(sessionsExt.id, id))
        .returning();
      return deleted ?? null;
    },
  };
}
