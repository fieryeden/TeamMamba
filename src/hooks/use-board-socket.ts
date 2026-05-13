import { useEffect, useRef, useCallback } from "react";
import { getSocket, connectSocket, disconnectSocket, joinBoard, leaveBoard } from "./use-socket";

export function useBoardSocket(boardId: string, handlers: {
  onItemCreated?: (data: unknown) => void;
  onItemUpdated?: (data: unknown) => void;
  onItemDeleted?: (data: unknown) => void;
  onItemMoved?: (data: unknown) => void;
  onColumnUpdated?: (data: unknown) => void;
  onGroupCreated?: (data: unknown) => void;
  onGroupUpdated?: (data: unknown) => void;
  onGroupDeleted?: (data: unknown) => void;
}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = connectSocket();
    joinBoard(boardId);

    const off: Array<() => void> = [];

    if (handlersRef.current.onItemCreated) {
      socket.on("item:created", handlersRef.current.onItemCreated);
      off.push(() => socket.off("item:created"));
    }
    if (handlersRef.current.onItemUpdated) {
      socket.on("item:updated", handlersRef.current.onItemUpdated);
      off.push(() => socket.off("item:updated"));
    }
    if (handlersRef.current.onItemDeleted) {
      socket.on("item:deleted", handlersRef.current.onItemDeleted);
      off.push(() => socket.off("item:deleted"));
    }
    if (handlersRef.current.onItemMoved) {
      socket.on("item:moved", handlersRef.current.onItemMoved);
      off.push(() => socket.off("item:moved"));
    }
    if (handlersRef.current.onColumnUpdated) {
      socket.on("column:updated", handlersRef.current.onColumnUpdated);
      off.push(() => socket.off("column:updated"));
    }
    if (handlersRef.current.onGroupCreated) {
      socket.on("group:created", handlersRef.current.onGroupCreated);
      off.push(() => socket.off("group:created"));
    }
    if (handlersRef.current.onGroupUpdated) {
      socket.on("group:updated", handlersRef.current.onGroupUpdated);
      off.push(() => socket.off("group:updated"));
    }
    if (handlersRef.current.onGroupDeleted) {
      socket.on("group:deleted", handlersRef.current.onGroupDeleted);
      off.push(() => socket.off("group:deleted"));
    }

    return () => {
      off.forEach((fn) => fn());
      leaveBoard(boardId);
    };
  }, [boardId]);
}
