import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3010";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

export function joinBoard(boardId: string) {
  const s = getSocket();
  if (s.connected) s.emit("join:board", boardId);
}

export function leaveBoard(boardId: string) {
  const s = getSocket();
  if (s.connected) s.emit("leave:board", boardId);
}

export function joinWorkspace(workspaceId: string) {
  const s = getSocket();
  if (s.connected) s.emit("join:workspace", workspaceId);
}

export function leaveWorkspace(workspaceId: string) {
  const s = getSocket();
  if (s.connected) s.emit("leave:workspace", workspaceId);
}
