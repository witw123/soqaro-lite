"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Socket } from "socket.io-client";
import {
  HeartIcon,
  ApplauseIcon,
  FlameIcon,
  SparklesIcon,
  MusicIcon,
  UsersIcon,
  ChevronDownIcon,
  CheckIcon
} from "@/components/icons/DiscoverIcons";
import {
  dispatchLocalReaction,
  type ReactionType
} from "./RoomReactionOverlay";

export type ReactionTargetSong = {
  id: string;
  title: string;
  artist?: string;
  requesterName?: string | null;
};

export type ReactionTargetMember = {
  id: string;
  nickname: string;
  isHost?: boolean;
  avatarUrl?: string | null;
};

type RoomReactionToolbarProps = {
  roomId: string;
  socket?: Socket | null;
  variant?: "interactive" | "request" | "radio";
  dropdownPlacement?: "top" | "bottom";
  targetSongs?: ReactionTargetSong[];
  activeSongId?: string | null;
  targetMembers?: ReactionTargetMember[];
  activeMemberId?: string | null;
  className?: string;
};

export function RoomReactionToolbar({
  roomId,
  socket,
  variant = "interactive",
  dropdownPlacement,
  targetSongs = [],
  activeSongId,
  targetMembers = [],
  activeMemberId,
  className = ""
}: RoomReactionToolbarProps) {
  const [activeReaction, setActiveReaction] = useState<ReactionType | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);

  const placement = dropdownPlacement ?? (variant === "request" ? "bottom" : "top");
  const placementClass = placement === "bottom" ? "top-full left-0 mt-2" : "bottom-full left-0 mb-2";

  const throttleTimerRef = useRef<{ [key: string]: number }>({});
  const comboTrackerRef = useRef<{ [key: string]: { count: number; lastAt: number } }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showSelector) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSelector]);

  // Resolve effective target song
  const currentSongId = selectedSongId ?? activeSongId ?? targetSongs[0]?.id ?? null;
  const selectedSong = targetSongs.find((s) => s.id === currentSongId) ?? targetSongs[0] ?? null;

  // Resolve effective target member
  const currentMemberId = selectedMemberId ?? activeMemberId ?? targetMembers[0]?.id ?? null;
  const selectedMember = targetMembers.find((m) => m.id === currentMemberId) ?? targetMembers[0] ?? null;

  const handleSendReaction = useCallback((reaction: ReactionType) => {
    const now = Date.now();
    const tracker = comboTrackerRef.current[reaction] ?? { count: 0, lastAt: 0 };
    if (now - tracker.lastAt < 1200) {
      tracker.count += 1;
    } else {
      tracker.count = 1;
    }
    tracker.lastAt = now;
    comboTrackerRef.current[reaction] = tracker;

    let targetLabel: string | undefined;
    let targetType: "member" | "track" | undefined;

    if (variant === "request" && selectedSong) {
      targetLabel = `《${selectedSong.title}》`;
      targetType = "track";
    } else if (variant === "radio" && selectedMember) {
      targetLabel = `@${selectedMember.nickname}`;
      targetType = "member";
    }

    // Instant local visual feedback
    dispatchLocalReaction({
      reaction,
      targetLabel,
      targetType,
      comboCount: tracker.count
    });

    setActiveReaction(reaction);
    window.setTimeout(() => setActiveReaction(null), 180);

    // Throttle network socket emit to 120ms per reaction type
    const lastEmit = throttleTimerRef.current[reaction] ?? 0;
    if (now - lastEmit > 120 && socket) {
      throttleTimerRef.current[reaction] = now;
      socket.emit("room.reaction", {
        roomId,
        reaction,
        trackId: selectedSong?.id ?? null
      });
    }
  }, [roomId, socket, variant, selectedSong, selectedMember]);

  // Variant: Request Room (点歌房 - 可选择歌曲互动)
  if (variant === "request") {
    return (
      <div ref={containerRef} className={`relative inline-flex items-center gap-1.5 p-1 rounded-2xl bg-surface/50 backdrop-blur-xl ${className}`}>
        {/* Song Selector Trigger */}
        {targetSongs.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowSelector((prev) => !prev)}
            className="flex items-center gap-1.5 max-w-[160px] sm:max-w-[200px] px-2.5 py-1.5 rounded-xl bg-surface/80 hover:bg-surface-hover text-xs text-foreground transition-all active:scale-95 border border-surface-border/60"
            title="选择要互动的歌曲"
          >
            <MusicIcon className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate font-medium">{selectedSong ? selectedSong.title : "选择歌曲"}</span>
            <ChevronDownIcon className={`w-3 h-3 text-foreground-muted transition-transform shrink-0 ${showSelector ? "rotate-180" : ""}`} />
          </button>
        ) : null}

        {/* Dropdown Menu for choosing songs */}
        {showSelector && targetSongs.length > 0 && (
          <div
            className={`absolute ${placementClass} w-72 max-h-64 overflow-y-auto overscroll-contain rounded-2xl p-2 bg-surface border border-surface-border shadow-xl z-50 animate-fade-in custom-scrollbar`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-surface-border/40 mb-1">
              <span className="text-xs font-medium text-foreground-muted">选择互动歌曲</span>
              <span className="text-xs text-foreground-muted/60">{targetSongs.length} 首可选</span>
            </div>
            <div className="space-y-1">
              {targetSongs.map((song) => {
                const isSelected = song.id === selectedSong?.id;
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      setSelectedSongId(song.id);
                      setShowSelector(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-all ${
                      isSelected
                        ? "bg-accent text-white font-semibold shadow-xs"
                        : "hover:bg-surface-hover text-foreground"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">《{song.title}》</p>
                      {song.artist && (
                        <p className={`text-xs truncate mt-0.5 ${isSelected ? "text-white/80" : "text-foreground-muted"}`}>
                          {song.artist}
                        </p>
                      )}
                    </div>
                    {song.requesterName && (
                      <span className={`text-xs shrink-0 px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-surface-hover text-foreground-muted"}`}>
                        @{song.requesterName}
                      </span>
                    )}
                    {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pure SVG Reaction Buttons */}
        <div className="flex items-center gap-0.5">
          <ReactionButton
            icon={<HeartIcon className="w-4 h-4 text-[#fa233b]" />}
            isActive={activeReaction === "like"}
            label="心动"
            onClick={() => handleSendReaction("like")}
          />
          <ReactionButton
            icon={<ApplauseIcon className="w-4 h-4 text-[#f59e0b]" />}
            isActive={activeReaction === "applause"}
            label="欢呼"
            onClick={() => handleSendReaction("applause")}
          />
          <ReactionButton
            icon={<FlameIcon className="w-4 h-4 text-[#ff5722]" />}
            isActive={activeReaction === "fire"}
            label="燃点"
            onClick={() => handleSendReaction("fire")}
          />
          <ReactionButton
            icon={<SparklesIcon className="w-4 h-4 text-[#a855f7]" />}
            isActive={activeReaction === "sparkle"}
            label="赞美"
            onClick={() => handleSendReaction("sparkle")}
          />
        </div>
      </div>
    );
  }

  // Variant: Radio Room (电台房 - 可选择成员互动)
  if (variant === "radio") {
    return (
      <div ref={containerRef} className={`relative flex items-center justify-between gap-2 p-1.5 rounded-2xl bg-surface/40 backdrop-blur-xl ${className}`}>
        {/* Target Member Selector Trigger */}
        {targetMembers.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowSelector((prev) => !prev)}
            className="flex items-center gap-1.5 max-w-[160px] sm:max-w-[190px] px-2.5 py-1.5 rounded-xl bg-surface/80 hover:bg-surface-hover text-xs text-foreground transition-all active:scale-95 border border-surface-border/60"
            title="选择要互动的成员"
          >
            <UsersIcon className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate font-medium">
              {selectedMember?.isHost ? `👑 @${selectedMember.nickname}` : `@${selectedMember?.nickname ?? "成员"}`}
            </span>
            <ChevronDownIcon className={`w-3 h-3 text-foreground-muted transition-transform shrink-0 ${showSelector ? "rotate-180" : ""}`} />
          </button>
        ) : null}

        {/* Dropdown Menu for choosing members */}
        {showSelector && targetMembers.length > 0 && (
          <div
            className={`absolute ${placementClass} w-64 max-h-64 overflow-y-auto overscroll-contain rounded-2xl p-2 bg-surface border border-surface-border shadow-xl z-50 animate-fade-in custom-scrollbar`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-surface-border/40 mb-1">
              <span className="text-xs font-medium text-foreground-muted">选择互动成员</span>
              <span className="text-xs text-foreground-muted/60">{targetMembers.length} 人在线</span>
            </div>
            <div className="space-y-1">
              {targetMembers.map((member) => {
                const isSelected = member.id === selectedMember?.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setSelectedMemberId(member.id);
                      setShowSelector(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-all ${
                      isSelected
                        ? "bg-accent text-white font-semibold shadow-xs"
                        : "hover:bg-surface-hover text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full border border-surface-border/60 bg-surface text-xs font-bold text-foreground shrink-0">
                        {member.nickname.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">@{member.nickname}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {member.isHost && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-accent/15 text-accent font-semibold"}`}>
                          主理人
                        </span>
                      )}
                      {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Pure SVG Reaction Buttons */}
        <div className="flex items-center gap-1">
          <ReactionButton
            icon={<HeartIcon className="w-4 h-4 text-[#fa233b]" />}
            isActive={activeReaction === "like"}
            label="心动"
            onClick={() => handleSendReaction("like")}
          />
          <ReactionButton
            icon={<ApplauseIcon className="w-4 h-4 text-[#f59e0b]" />}
            isActive={activeReaction === "applause"}
            label="欢呼"
            onClick={() => handleSendReaction("applause")}
          />
          <ReactionButton
            icon={<FlameIcon className="w-4 h-4 text-[#ff5722]" />}
            isActive={activeReaction === "fire"}
            label="燃点"
            onClick={() => handleSendReaction("fire")}
          />
          <ReactionButton
            icon={<SparklesIcon className="w-4 h-4 text-[#a855f7]" />}
            isActive={activeReaction === "sparkle"}
            label="赞美"
            onClick={() => handleSendReaction("sparkle")}
          />
        </div>
      </div>
    );
  }

  // Default: Interactive Room Floating Bar (多人互动房)
  return (
    <div
      aria-label="实时房间互动"
      className={`inline-flex items-center gap-1 p-1 rounded-full bg-surface/50 backdrop-blur-xl transition-all ${className}`}
    >
      <ReactionButton
        icon={<HeartIcon className="w-4 h-4 text-[#fa233b]" />}
        isActive={activeReaction === "like"}
        label="心动"
        onClick={() => handleSendReaction("like")}
      />
      <ReactionButton
        icon={<ApplauseIcon className="w-4 h-4 text-[#f59e0b]" />}
        isActive={activeReaction === "applause"}
        label="欢呼"
        onClick={() => handleSendReaction("applause")}
      />
      <ReactionButton
        icon={<FlameIcon className="w-4 h-4 text-[#ff5722]" />}
        isActive={activeReaction === "fire"}
        label="燃点"
        onClick={() => handleSendReaction("fire")}
      />
      <ReactionButton
        icon={<SparklesIcon className="w-4 h-4 text-[#a855f7]" />}
        isActive={activeReaction === "sparkle"}
        label="赞美"
        onClick={() => handleSendReaction("sparkle")}
      />
    </div>
  );
}

function ReactionButton({
  icon,
  label,
  isActive,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl transition-all duration-150 hover:bg-white/[0.08] active:scale-90 ${
        isActive ? "scale-125 bg-white/15" : ""
      }`}
    >
      {icon}
    </button>
  );
}
