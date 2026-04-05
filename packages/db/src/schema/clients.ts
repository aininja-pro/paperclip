import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    industry: text("industry"),
    contacts: jsonb("contacts").$type<ClientContact[]>(),
    notes: text("notes"),
    contextPath: text("context_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("clients_company_idx").on(table.companyId),
  }),
);

export type ClientContact = {
  name: string;
  role?: string;
  email?: string;
};
