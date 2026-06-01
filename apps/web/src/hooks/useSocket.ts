"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/store/auth.store";

export function useSocket(tournamentId: string) {
  const { accessToken } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken || !tournamentId) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000", {
      auth: { token: accessToken },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join:tournament", tournamentId);
    });

    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.emit("leave:tournament", tournamentId);
      socket.disconnect();
    };
  }, [accessToken, tournamentId]);

  const onMatchUpdated = (cb: (match: any) => void) => {
    socketRef.current?.on("match:updated", cb);
    return () => { socketRef.current?.off("match:updated", cb); };
  };

  return { connected, onMatchUpdated };
}
