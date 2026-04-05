import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { sessionsExt, blueprints, projectWorkspaces, projects } from "@paperclipai/db";
import type { Server as SocketIOServer } from "socket.io";
import { logger } from "../middleware/logger.js";

interface RunningBuild {
  process: ChildProcess;
  sessionId: string;
  output: string;
  stdinEnabled: boolean;
}

const runningBuilds = new Map<string, RunningBuild>();

export function builderService(db: Db, io: SocketIOServer) {
  async function getProjectWorkspaceCwd(projectId: string): Promise<string | null> {
    const [workspace] = await db
      .select({ cwd: projectWorkspaces.cwd })
      .from(projectWorkspaces)
      .where(
        and(
          eq(projectWorkspaces.projectId, projectId),
          eq(projectWorkspaces.isPrimary, true),
        ),
      );
    return workspace?.cwd ?? null;
  }

  async function getBlueprintContent(
    blueprintId: string,
    workspaceCwd: string,
  ): Promise<{ title: string; content: string } | null> {
    const [blueprint] = await db
      .select()
      .from(blueprints)
      .where(eq(blueprints.id, blueprintId));
    if (!blueprint) return null;

    // Try reading the blueprint file from the workspace
    try {
      const filePath = resolve(workspaceCwd, blueprint.filename);
      const content = await readFile(filePath, "utf-8");
      return { title: blueprint.title, content };
    } catch {
      // If file doesn't exist, use the title as a fallback prompt
      return { title: blueprint.title, content: `Blueprint: ${blueprint.title}` };
    }
  }

  return {
    startBuild: async (
      projectId: string,
      blueprintId: string,
    ): Promise<{ sessionId: string }> => {
      // Get project workspace path
      const cwd = await getProjectWorkspaceCwd(projectId);
      if (!cwd) {
        throw new Error("No workspace configured for this project");
      }

      // Get blueprint content
      const blueprint = await getBlueprintContent(blueprintId, cwd);
      if (!blueprint) {
        throw new Error("Blueprint not found");
      }

      // Create session record
      const [session] = await db
        .insert(sessionsExt)
        .values({
          projectId,
          blueprintId,
          agentType: "builder",
          status: "running",
        })
        .returning();

      const sessionId = session.id;

      // Spawn claude CLI process
      const prompt = `Execute this blueprint:\n\n${blueprint.content}`;
      const child = spawn("claude", ["--print", prompt], {
        cwd,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const build: RunningBuild = {
        process: child,
        sessionId,
        output: "",
        stdinEnabled: false,
      };
      runningBuilds.set(sessionId, build);

      // Stream stdout
      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        build.output += text;
        io.to(`build:${sessionId}`).emit("session:output", {
          sessionId,
          data: text,
        });
      });

      // Stream stderr
      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        build.output += text;
        io.to(`build:${sessionId}`).emit("session:output", {
          sessionId,
          data: `\x1b[31m${text}\x1b[0m`,
        });
      });

      // Handle process exit
      child.on("close", async (code) => {
        const status = code === 0 ? "completed" : "failed";
        runningBuilds.delete(sessionId);

        try {
          await db
            .update(sessionsExt)
            .set({
              status,
              summary: build.output.slice(0, 5000),
              completedAt: new Date(),
            })
            .where(eq(sessionsExt.id, sessionId));
        } catch (err) {
          logger.error({ err, sessionId }, "Failed to update session on completion");
        }

        io.to(`build:${sessionId}`).emit("session:status", {
          sessionId,
          status,
        });

        logger.info({ sessionId, code, status }, "Build process exited");
      });

      child.on("error", async (err) => {
        runningBuilds.delete(sessionId);
        logger.error({ err, sessionId }, "Build process error");

        try {
          await db
            .update(sessionsExt)
            .set({
              status: "failed",
              summary: `Process error: ${err.message}`,
              completedAt: new Date(),
            })
            .where(eq(sessionsExt.id, sessionId));
        } catch (updateErr) {
          logger.error({ err: updateErr, sessionId }, "Failed to update session on error");
        }

        io.to(`build:${sessionId}`).emit("session:status", {
          sessionId,
          status: "failed",
        });
        io.to(`build:${sessionId}`).emit("session:output", {
          sessionId,
          data: `\x1b[31mProcess error: ${err.message}\x1b[0m\r\n`,
        });
      });

      logger.info({ sessionId, projectId, blueprintId, cwd }, "Build started");

      return { sessionId };
    },

    killBuild: async (sessionId: string): Promise<boolean> => {
      const build = runningBuilds.get(sessionId);
      if (!build) return false;
      build.process.kill("SIGTERM");
      // Give it 5s then SIGKILL
      setTimeout(() => {
        if (runningBuilds.has(sessionId)) {
          build.process.kill("SIGKILL");
        }
      }, 5000);
      return true;
    },

    getStatus: async (sessionId: string) => {
      const [session] = await db
        .select()
        .from(sessionsExt)
        .where(eq(sessionsExt.id, sessionId));
      if (!session) return null;

      const build = runningBuilds.get(sessionId);
      return {
        ...session,
        output: build?.output ?? session.summary ?? "",
        isRunning: !!build,
      };
    },

    sendInput: (sessionId: string, data: string): boolean => {
      const build = runningBuilds.get(sessionId);
      if (!build || !build.stdinEnabled) return false;
      build.process.stdin?.write(data);
      return true;
    },

    enableStdin: (sessionId: string): boolean => {
      const build = runningBuilds.get(sessionId);
      if (!build) return false;
      build.stdinEnabled = true;
      return true;
    },

    disableStdin: (sessionId: string): boolean => {
      const build = runningBuilds.get(sessionId);
      if (!build) return false;
      build.stdinEnabled = false;
      return true;
    },

    getBufferedOutput: (sessionId: string): string | null => {
      const build = runningBuilds.get(sessionId);
      return build?.output ?? null;
    },
  };
}

export type BuilderService = ReturnType<typeof builderService>;
