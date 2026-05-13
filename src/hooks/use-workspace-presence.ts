import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { joinWorkspace, leaveWorkspace, connectSocket } from "./use-socket";

export function useWorkspacePresence(workspaceId: string | null) {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;

    const socket = connectSocket();
    joinWorkspace(workspaceId);

    socket.on("presence", (data: { workspaceId: string; count: number }) => {
      if (data.workspaceId === workspaceId) {
        setOnlineCount(data.count);
      }
    });

    return () => {
      socket.off("presence");
      leaveWorkspace(workspaceId);
    };
  }, [workspaceId]);

  return onlineCount;
}
