import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type { BuilderService } from "../services/builder.js";
import { logger } from "../middleware/logger.js";

export function setupBuilderSocketIO(server: HttpServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io/",
  });

  // Late-bound builder service reference (set after service creation)
  let builder: BuilderService | null = null;

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Builder socket connected");

    socket.on("session:join", ({ sessionId }: { sessionId: string }) => {
      socket.join(`build:${sessionId}`);
      logger.info({ socketId: socket.id, sessionId }, "Joined build session");

      // Replay buffered output
      const buffered = builder?.getBufferedOutput(sessionId);
      if (buffered) {
        socket.emit("session:output", { sessionId, data: buffered });
      }
    });

    socket.on("session:leave", ({ sessionId }: { sessionId: string }) => {
      socket.leave(`build:${sessionId}`);
    });

    socket.on("session:input", ({ sessionId, data }: { sessionId: string; data: string }) => {
      builder?.sendInput(sessionId, data);
    });

    socket.on("session:takeover", ({ sessionId }: { sessionId: string }) => {
      const enabled = builder?.enableStdin(sessionId);
      if (enabled) {
        io.to(`build:${sessionId}`).emit("session:control", {
          sessionId,
          mode: "interactive",
        });
      }
    });

    socket.on("session:release", ({ sessionId }: { sessionId: string }) => {
      builder?.disableStdin(sessionId);
      io.to(`build:${sessionId}`).emit("session:control", {
        sessionId,
        mode: "view",
      });
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Builder socket disconnected");
    });
  });

  return {
    io,
    attachBuilderService(svc: BuilderService) {
      builder = svc;
    },
  };
}
