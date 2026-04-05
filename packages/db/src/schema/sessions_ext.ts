import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { blueprints } from "./blueprints.js";

export const sessionsExt = pgTable(
  "sessions_ext",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    blueprintId: uuid("blueprint_id").references(() => blueprints.id),
    runId: uuid("run_id"), // links to Paperclip's heartbeat_runs table
    agentType: text("agent_type"), // architect | builder
    status: text("status").notNull().default("running"),
    // running | completed | failed | needs_approval
    summary: text("summary"),
    filesChanged: jsonb("files_changed").$type<string[]>(),
    testResults: jsonb("test_results").$type<SessionTestResults>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    projectIdx: index("sessions_ext_project_idx").on(table.projectId),
    blueprintIdx: index("sessions_ext_blueprint_idx").on(table.blueprintId),
  }),
);

export type SessionTestResults = {
  passed: number;
  failed: number;
  errors?: Array<{ test: string; message: string; file?: string; line?: number }>;
};
