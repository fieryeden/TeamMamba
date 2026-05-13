import { Server as NetServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { NextApiResponse } from "next";

export type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: NetServer & {
      io?: SocketIOServer;
    };
  };
};

let io: SocketIOServer | undefined;

export function getIO(): SocketIOServer | undefined {
  return io;
}

export function initIO(server: NetServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Join workspace rooms
    socket.on("join:workspace", (workspaceId: string) => {
      socket.join(`workspace:${workspaceId}`);
    });

    // Join board rooms
    socket.on("join:board", (boardId: string) => {
      socket.join(`board:${boardId}`);
    });

    // Leave rooms
    socket.on("leave:workspace", (workspaceId: string) => {
      socket.leave(`workspace:${workspaceId}`);
    });

    socket.on("leave:board", (boardId: string) => {
      socket.leave(`board:${boardId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  return io;
}

// Broadcast helpers
export function broadcastToBoard(boardId: string, event: string, data: unknown) {
  io?.to(`board:${boardId}`).emit(event, data);
}

export function broadcastToWorkspace(workspaceId: string, event: string, data: unknown) {
  io?.to(`workspace:${workspaceId}`).emit(event, data);
}
