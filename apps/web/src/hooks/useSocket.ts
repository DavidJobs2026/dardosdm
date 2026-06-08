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

  /** Fires when the tournament status changes (start, finalize, open registration) */
  const onTournamentUpdated = (cb: (data: any) => void) => {
    socketRef.current?.on("tournament:updated", cb);
    return () => { socketRef.current?.off("tournament:updated", cb); };
  };

  /** Fires when the server wants this device to play a TTS announcement */
  const onAnnouncerSpeak = (cb: (payload: any) => void) => {
    socketRef.current?.on("announcer:speak", cb);
    return () => { socketRef.current?.off("announcer:speak", cb); };
  };

  /** Emit an event to the socket */
  const emit = (event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args);
  };

  return { connected, onMatchUpdated, onTournamentUpdated, onAnnouncerSpeak, emit };
}
