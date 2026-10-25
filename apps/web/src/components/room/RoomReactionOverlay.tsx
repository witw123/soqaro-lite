"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { RoomReactionPayload } from "@soqaro/shared";
import {
  HeartIcon,
  ApplauseIcon,
  FlameIcon,
  SparklesIcon
} from "@/components/icons/DiscoverIcons";

export type ReactionType = "like" | "applause" | "fire" | "sparkle";

type FloatingParticle = {
  id: string;
  reaction: ReactionType;
  senderName?: string;
  targetLabel?: string;
  targetType?: "member" | "track";
  startX: number; // percentage across stage width
  driftX: number; // px horizontal drift
  scale: number;
  rotation: number;
  comboCount: number;
  createdAt: number;
};

const reactionConfig = {
  like: {
    icon: HeartIcon,
    color: "text-[#fa233b]",
    glow: "drop-shadow-sm",
    bgGradient: "from-[#fa233b]/20 to-transparent"
  },
  applause: {
    icon: ApplauseIcon,
    color: "text-[#f59e0b]",
    glow: "drop-shadow-sm",
    bgGradient: "from-[#f59e0b]/20 to-transparent"
  },
  fire: {
    icon: FlameIcon,
    color: "text-[#ff5722]",
    glow: "drop-shadow-sm",
    bgGradient: "from-[#ff5722]/20 to-transparent"
  },
  sparkle: {
    icon: SparklesIcon,
    color: "text-[#a855f7]",
    glow: "drop-shadow-sm",
    bgGradient: "from-[#a855f7]/20 to-transparent"
  }
} as const;

export const localReactionDispatchEvent = "soqaro:local-reaction";

export function dispatchLocalReaction(payload: {
  reaction: ReactionType;
  senderName?: string;
  targetLabel?: string;
  targetType?: "member" | "track";
  comboCount?: number;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(localReactionDispatchEvent, { detail: payload })
  );
  try {
    const raw = window.localStorage.getItem("soqaro-interaction-stats");
    const current = raw ? JSON.parse(raw) : { sentLikes: 0, sentApplause: 0, receivedReactions: 0 };
    if (payload.reaction === "like") current.sentLikes = (current.sentLikes ?? 0) + 1;
    else if (payload.reaction === "applause") current.sentApplause = (current.sentApplause ?? 0) + 1;
    else current.receivedReactions = (current.receivedReactions ?? 0) + 1;
    window.localStorage.setItem("soqaro-interaction-stats", JSON.stringify(current));
  } catch {}
}

export function RoomReactionOverlay({
  roomId,
  socket
}: {
  roomId: string;
  socket?: Socket | null;
}) {
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const comboTrackerRef = useRef<{ [key: string]: { count: number; lastAt: number } }>({});

  const spawnParticle = useCallback((
    reaction: ReactionType,
    senderName = "",
    explicitCombo?: number,
    targetLabel?: string,
    targetType?: "member" | "track"
  ) => {
    const now = Date.now();
    const tracker = comboTrackerRef.current[reaction] ?? { count: 0, lastAt: 0 };
    let combo = explicitCombo ?? 1;

    if (!explicitCombo) {
      if (now - tracker.lastAt < 1200) {
        tracker.count += 1;
      } else {
        tracker.count = 1;
      }
      tracker.lastAt = now;
      comboTrackerRef.current[reaction] = tracker;
      combo = tracker.count;
    }

    const startX = 70 + Math.random() * 20; // Float from the right quadrant (70% - 90%)
    const driftX = (Math.random() - 0.5) * 60;
    const rotation = (Math.random() - 0.5) * 30;
    const scale = combo > 10 ? 1.45 : combo > 5 ? 1.25 : combo > 2 ? 1.1 : 1.0;

    const particle: FloatingParticle = {
      id: `${reaction}_${now}_${Math.random().toString(36).slice(2, 7)}`,
      reaction,
      senderName,
      targetLabel,
      targetType,
      startX,
      driftX,
      scale,
      rotation,
      comboCount: combo,
      createdAt: now
    };

    setParticles((prev) => {
      const active = prev.filter((p) => now - p.createdAt < 2200);
      return active.length >= 25 ? [...active.slice(1), particle] : [...active, particle];
    });
  }, []);

  // Listen to remote WebSocket room.reaction
  useEffect(() => {
    if (!socket) return;

    const handleRemoteReaction = (payload: RoomReactionPayload) => {
      if (payload.roomId !== roomId) return;
      spawnParticle(payload.reaction as ReactionType, payload.senderName);
    };

    socket.on("room.reaction", handleRemoteReaction);
    return () => {
      socket.off("room.reaction", handleRemoteReaction);
    };
  }, [roomId, socket, spawnParticle]);

  // Listen to local fast-feedback dispatch
  useEffect(() => {
    const handleLocal = (event: Event) => {
      const customEvent = event as CustomEvent<{
        reaction: ReactionType;
        senderName?: string;
        targetLabel?: string;
        targetType?: "member" | "track";
        comboCount?: number;
      }>;
      if (customEvent.detail) {
        spawnParticle(
          customEvent.detail.reaction,
          customEvent.detail.senderName,
          customEvent.detail.comboCount,
          customEvent.detail.targetLabel,
          customEvent.detail.targetType
        );
      }
    };

    window.addEventListener(localReactionDispatchEvent, handleLocal);
    return () => {
      window.removeEventListener(localReactionDispatchEvent, handleLocal);
    };
  }, [spawnParticle]);

  // Cleanup aged particles
  useEffect(() => {
    if (particles.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setParticles((prev) => prev.filter((p) => now - p.createdAt < 2200));
    }, 400);
    return () => window.clearInterval(timer);
  }, [particles.length]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      {particles.map((particle) => {
        const config = reactionConfig[particle.reaction] ?? reactionConfig.like;
        const IconComp = config.icon;
        const isHighCombo = particle.comboCount >= 3;

        return (
          <div
            key={particle.id}
            style={{
              left: `${particle.startX}%`,
              bottom: "15%",
              transform: `scale(${particle.scale}) rotate(${particle.rotation}deg)`,
              ["--drift-x" as string]: `${particle.driftX}px`
            }}
            className="animate-floating-particle absolute flex items-center gap-1.5 will-change-transform"
          >
            <div
              className={`flex items-center justify-center p-2 rounded-full backdrop-blur-md bg-black/40 border border-white/10 ${config.glow}`}
            >
              <IconComp className={`w-5 h-5 sm:w-6 sm:h-6 ${config.color}`} />
            </div>

            {particle.targetLabel ? (
              <span className="max-w-[120px] truncate text-xs font-medium px-2 py-0.5 rounded-full backdrop-blur-md bg-black/60 text-white/90 border border-white/10 shadow-sm">
                {particle.targetLabel}
              </span>
            ) : null}

            {isHighCombo && (
              <span className="font-extrabold text-xs tabular-nums text-white bg-accent px-1.5 py-0.5 rounded-full shadow-xs animate-pulse">
                x{particle.comboCount}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
