import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import type { ClientContact } from "@paperclipai/db/schema/clients";
import { notFound } from "../errors.js";

export function clientService(db: Db) {
  return {
    list: (companyId: string) =>
      db.select().from(clients).where(eq(clients.companyId, companyId)),

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(clients)
        .where(eq(clients.id, id))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    create: async (
      companyId: string,
      data: { name: string; industry?: string | null; contacts?: ClientContact[] | null; notes?: string | null; contextPath?: string | null },
    ) => {
      const [created] = await db
        .insert(clients)
        .values({
          companyId,
          name: data.name,
          industry: data.industry ?? null,
          contacts: data.contacts ?? null,
          notes: data.notes ?? null,
          contextPath: data.contextPath ?? null,
        })
        .returning();
      return created;
    },

    update: async (
      id: string,
      data: Partial<{ name: string; industry: string | null; contacts: ClientContact[] | null; notes: string | null; contextPath: string | null }>,
    ) => {
      const [updated] = await db
        .update(clients)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(clients.id, id))
        .returning();
      return updated ?? null;
    },

    remove: async (id: string) => {
      const [deleted] = await db
        .delete(clients)
        .where(eq(clients.id, id))
        .returning();
      return deleted ?? null;
    },
  };
}
