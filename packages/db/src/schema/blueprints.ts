import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

export const blueprints = pgTable(
  "blueprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    status: text("status").notNull().default("draft"),
    // draft | approved | building | built
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    builtAt: timestamp("built_at", { withTimezone: true }),
  },
  (table) => ({
    projectIdx: index("blueprints_project_idx").on(table.projectId),
  }),
);
