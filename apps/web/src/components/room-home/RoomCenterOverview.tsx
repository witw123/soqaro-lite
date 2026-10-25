"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AuthSession, RoomSnapshot } from "@soqaro/shared";
import { soqaroApi, type RoomActivitySummary } from "@/lib/network/soqaro-api";
import { getOnlineMemberCount } from "@/lib/domain/soqaro-ui";
import {
  UsersIcon,
  HeartIcon,
  ActivityIcon,
  ApplauseIcon,
  ExternalLinkIcon
} from "@/components/icons/DiscoverIcons";
import { roomTypeLabel } from "./room-home-types";

export function RoomCenterOverview({ activeSession }: { activeSession: AuthSession }) {
  const [showAllOwned, setShowAllOwned] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["room-center-overview", activeSession.userId],
    queryFn: async () => {
      const [owned, recent, nextStats] = await Promise.all([
        soqaroApi.listOwnedRooms(),
        soqaroApi.getRoomActivity(),
        soqaroApi.getRoomInteractionStats()
      ]);
      return { owned, recent, stats: nextStats };
    },
    staleTime: 30 * 1000
  });

  const ownedRooms = data?.owned ?? [];
  const recentRooms = data?.recent ?? [];
  const stats = data?.stats ?? null;

  if (isLoading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <section className="rounded-2xl border border-surface-border/40 bg-surface/30 p-5 sm:p-6">
          <div className="h-5 w-28 bg-surface-hover rounded mb-4" />
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-surface/50 border border-surface-border/30" />
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-surface-border/40 bg-surface/30 p-5 sm:p-6">
          <div className="h-5 w-32 bg-surface-hover rounded mb-4" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-surface/50 border border-surface-border/30" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Interaction Stats */}
      <section className="rounded-2xl border border-white/[0.08] bg-surface/30 p-5 sm:p-6 backdrop-blur-xl">
        <h3 className="text-base font-bold text-foreground mb-4">房间互动成就</h3>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            label="发出点赞"
            value={stats?.sentLikes ?? 0}
            icon={<HeartIcon className="w-4 h-4 text-accent" />}
          />
          <StatCard
            label="发出鼓掌"
            value={stats?.sentApplause ?? 0}
            icon={<ApplauseIcon className="w-4 h-4 text-accent" />}
          />
          <StatCard
            label="收到互动"
            value={stats?.receivedReactions ?? 0}
            icon={<ActivityIcon className="w-4 h-4 text-accent" />}
          />
        </div>
      </section>

      {/* Owned Rooms */}
      <section className="rounded-2xl border border-white/[0.08] bg-surface/30 p-5 sm:p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-foreground">我创建的房间</h3>
          <Link
            className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-1 transition-colors"
            href="/app"
          >
            <span>探索房间大厅</span>
            <ExternalLinkIcon className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(showAllOwned ? ownedRooms : ownedRooms.slice(0, 6)).map((snapshot) => (
            <OwnedRoomCard key={snapshot.room.id} snapshot={snapshot} />
          ))}
          {ownedRooms.length === 0 ? (
            <div className="col-span-full py-8 text-center rounded-2xl bg-surface/20 text-foreground-muted text-xs">
              还没有创建房间
            </div>
          ) : null}
        </div>

        {ownedRooms.length > 6 ? (
          <button
            className="mt-4 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            onClick={() => setShowAllOwned((current) => !current)}
            type="button"
          >
            {showAllOwned ? "收起" : `查看全部 ${ownedRooms.length} 个房间`}
          </button>
        ) : null}
      </section>

      {/* Recent Rooms */}
      <section className="rounded-2xl border border-white/[0.08] bg-surface/30 p-5 sm:p-6 backdrop-blur-xl">
        <h3 className="text-base font-bold text-foreground mb-4">最近参与</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(showAllRecent ? recentRooms : recentRooms.slice(0, 6)).map((room) => (
            <RecentRoomCard key={room.roomId} room={room} />
          ))}
          {recentRooms.length === 0 ? (
            <div className="col-span-full py-8 text-center rounded-2xl bg-surface/20 text-foreground-muted text-xs">
              还没有参与记录
            </div>
          ) : null}
        </div>

        {recentRooms.length > 6 ? (
          <button
            className="mt-4 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            onClick={() => setShowAllRecent((current) => !current)}
            type="button"
          >
            {showAllRecent ? "收起" : `查看全部 ${recentRooms.length} 条记录`}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function OwnedRoomCard({ snapshot }: { snapshot: RoomSnapshot }) {
  const room = snapshot.room;
  const onlineCount = getOnlineMemberCount(room.members);
  return (
    <Link
      className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-white/10"
      href={`/room/${room.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-semibold text-sm text-foreground group-hover:text-accent transition-colors">
          {room.name ?? "未命名房间"}
        </span>
        <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-surface-elevated text-foreground-muted">
          {roomTypeLabel(room.roomType)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-foreground-muted">
        <span className="inline-flex items-center gap-1">
          <UsersIcon className="w-3 h-3 text-accent" />
          <span>{onlineCount} 人在线</span>
        </span>
        <span className="text-foreground-muted font-mono text-xs">
          {room.playback.status === "playing" ? "▶ 播放中" : "已暂停"}
        </span>
      </div>
    </Link>
  );
}

function RecentRoomCard({ room }: { room: RoomActivitySummary }) {
  return (
    <Link
      className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-white/10"
      href={`/room/${room.roomId}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-semibold text-sm text-foreground group-hover:text-accent transition-colors">
          {room.roomName}
        </span>
        <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-surface-elevated text-foreground-muted">
          {roomTypeLabel(room.roomType)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-foreground-muted">
        <span>{room.isActive ? "正在房间中" : "最近参与"}</span>
        <span className="shrink-0 font-mono text-xs text-foreground-muted">{formatDuration(room.durationMs)}</span>
      </div>
    </Link>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground-muted">{label}</span>
        {icon}
      </div>
      <span className="block text-xl sm:text-2xl font-bold text-foreground tabular-nums tracking-tight">
        {value}
      </span>
    </div>
  );
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  return totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} 小时 ${totalMinutes % 60} 分钟` : `${totalMinutes} 分钟`;
}
