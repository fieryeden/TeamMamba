import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const port = parseInt(process.env.PORT || "3010", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Socket.IO setup
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010",
      methods: ["GET", "POST"],
    },
  });

  // Track connected users per workspace/board
  const connectedUsers = new Map<string, Set<string>>();

  io.on("connection", (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    // Join workspace room
    socket.on("join:workspace", (workspaceId: string) => {
      socket.join(`workspace:${workspaceId}`);
      if (!connectedUsers.has(workspaceId)) {
        connectedUsers.set(workspaceId, new Set());
      }
      connectedUsers.get(workspaceId)!.add(socket.id);
      io.to(`workspace:${workspaceId}`).emit("presence", {
        workspaceId,
        count: connectedUsers.get(workspaceId)!.size,
      });
    });

    // Leave workspace room
    socket.on("leave:workspace", (workspaceId: string) => {
      socket.leave(`workspace:${workspaceId}`);
      connectedUsers.get(workspaceId)?.delete(socket.id);
      io.to(`workspace:${workspaceId}`).emit("presence", {
        workspaceId,
        count: connectedUsers.get(workspaceId)?.size || 0,
      });
    });

    // Join board room
    socket.on("join:board", (boardId: string) => {
      socket.join(`board:${boardId}`);
    });

    socket.on("leave:board", (boardId: string) => {
      socket.leave(`board:${boardId}`);
    });

    // Board events
    socket.on("item:created", (data: { boardId: string; item: unknown }) => {
      socket.to(`board:${data.boardId}`).emit("item:created", data);
    });

    socket.on("item:updated", (data: { boardId: string; item: unknown }) => {
      socket.to(`board:${data.boardId}`).emit("item:updated", data);
    });

    socket.on("item:deleted", (data: { boardId: string; itemId: string }) => {
      socket.to(`board:${data.boardId}`).emit("item:deleted", data);
    });

    socket.on("item:moved", (data: { boardId: string; item: unknown; fromGroupId: string; toGroupId: string }) => {
      socket.to(`board:${data.boardId}`).emit("item:moved", data);
    });

    socket.on("column:updated", (data: { boardId: string; columnValue: unknown }) => {
      socket.to(`board:${data.boardId}`).emit("column:updated", data);
    });

    socket.on("group:created", (data: { boardId: string; group: unknown }) => {
      socket.to(`board:${data.boardId}`).emit("group:created", data);
    });

    socket.on("group:updated", (data: { boardId: string; group: unknown }) => {
      socket.to(`board:${data.boardId}`).emit("group:updated", data);
    });

    socket.on("group:deleted", (data: { boardId: string; groupId: string }) => {
      socket.to(`board:${data.boardId}`).emit("group:deleted", data);
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`🔌 Disconnected: ${socket.id}`);
      connectedUsers.forEach((users, workspaceId) => {
        if (users.delete(socket.id)) {
          io.to(`workspace:${workspaceId}`).emit("presence", {
            workspaceId,
            count: users.size,
          });
        }
      });
    });
  });

  server.listen(port, () => {
    console.log(`🚀 TeamMamba ready on http://localhost:${port}`);
    console.log(`🔌 Socket.IO enabled`);
  });
});
