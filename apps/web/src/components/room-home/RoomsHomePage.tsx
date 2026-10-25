"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCw, User, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { RoomDirectoryItem, RoomType } from "@soqaro/shared";
import { useSessionIdentity } from "@/features/session/use-session-identity";
import { buildAppEntryHref, buildWorkspaceAuthHref } from "@/lib/domain/client-shell";
import { soqaroApi } from "@/lib/network/soqaro-api";
import { toUserFacingError } from "@/lib/domain/soqaro-ui";
import {
  buildRoomJoinBootstrapSnapshot,
  storeRoomSnapshotHandoff
} from "@/lib/domain/room-snapshot-handoff";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/shell";
import { AwayRoomReturnButton } from "./AwayRoomReturnButton";
import { RoomDirectoryCard } from "@/components/room-card";
import { roomAudioOutput } from "@/features/playback/room-audio-output";
import { useWorkspacePageActive } from "@/features/workspace/page-activity";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { CreateRoomDialogModal } from "./CreateRoomDialogModal";
import { JoinCodeDialogModal } from "./JoinCodeDialogModal";
import { SelectedRoomDialogModal } from "./SelectedRoomDialogModal";
import { roomTypeLabel, type CreateRoomForm } from "./room-home-types";
import {
  readAwayRoomId,
  requestAwayRoomResume
} from "@/lib/domain/away-room";
import { buildRoomHref } from "@/lib/domain/room-url";

const lastRoomStorageKey = "soqaro-last-room";
const emptyRooms: RoomDirectoryItem[] = [];

type RoomsHomePageProps = {
  awayRoomId?: string | null;
  hasBottomPlayer?: boolean;
  onResumeAwayRoom?: () => void;
  showSidebar?: boolean;
};

export function RoomsHomePage({
  awayRoomId,
  hasBottomPlayer = false,
  onResumeAwayRoom,
  showSidebar = true
}: RoomsHomePageProps = {}) {
  const router = useRouter();
  const workspaceEntryHref = buildAppEntryHref();
  const authEntryHref = buildWorkspaceAuthHref({
    redirectTo: workspaceEntryHref
  });
  const {
    activeSession,
    hydrated,
    statusMessage,
    setStatusMessage,
  } = useSessionIdentity({
    sessionStorageKey: "soqaro-session",
    initialStatusMessage: ""
  });
  const pageActive = useWorkspacePageActive();
  const queryClient = useQueryClient();
  const roomsQuery = useQuery({
    queryKey: ["rooms", activeSession?.userId ?? null],
    queryFn: ({ signal }) => soqaroApi.listRooms(signal),
    enabled: hydrated && pageActive,
    staleTime: 10_000,
    refetchInterval: pageActive ? 10_000 : false
  });
  const availableRooms = Array.isArray(roomsQuery.data) ? roomsQuery.data : emptyRooms;
  const roomsLoaded = !roomsQuery.isPending;
  const refreshAvailableRooms = roomsQuery.refetch;
  const [roomTypeFilter, setRoomTypeFilter] = useState<"all" | RoomType>("all");
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFormVisibility, setCreateFormVisibility] = useState<"public" | "private">("public");
  const [selectedRoom, setSelectedRoom] = useState<RoomDirectoryItem | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [storedAwayRoomId, setStoredAwayRoomId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const joinInFlightRef = useRef(false);
  const effectiveAwayRoomId = awayRoomId ?? storedAwayRoomId;

  useEffect(() => {
    if (awayRoomId !== undefined) {
      setStoredAwayRoomId(awayRoomId);
      return;
    }

    setStoredAwayRoomId(readAwayRoomId());
  }, [awayRoomId]);

  function handleResumeAwayRoom() {
    if (!effectiveAwayRoomId) return;
    if (onResumeAwayRoom) {
      onResumeAwayRoom();
      return;
    }

    requestAwayRoomResume(effectiveAwayRoomId);
    router.push(buildRoomHref(effectiveAwayRoomId) as Route);
  }

  useEffect(() => {
    if (roomsQuery.error) setStatusMessage(toUserFacingError(roomsQuery.error));
  }, [roomsQuery.error, setStatusMessage]);

  useEffect(() => {
    if (!pageActive) {
      void queryClient.cancelQueries({
        queryKey: ["rooms", activeSession?.userId ?? null],
        type: "inactive"
      });
    }
  }, [pageActive, activeSession?.userId, queryClient]);

  function openCreateRoom(visibility: "public" | "private") {
    if (!activeSession) {
      setStatusMessage("创建房间需要先登录账号。");
      router.push(authEntryHref as Route);
      return;
    }
    setCreateFormVisibility(visibility);
    setDialogError(null);
    setCreateDialogOpen(true);
  }

  function openJoinDialog() {
    if (!activeSession) {
      setStatusMessage("加入房间需要先登录账号。");
      router.push(authEntryHref as Route);
      return;
    }
    setDialogError(null);
    setJoinDialogOpen(true);
  }

  async function handleCreateRoom(form: CreateRoomForm) {
    primeRoomAudioFromUserGesture();
    try {
      const snapshot = await soqaroApi.createRoom({
        visibility: form.visibility,
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        password: form.password.trim() || undefined,
        roomType: form.roomType,
        ...(form.roomType === "interactive"
          ? { newMemberPermissions: form.newMemberPermissions }
          : {})
      });
      storeRoomSnapshotHandoff(snapshot);
      window.localStorage.setItem(lastRoomStorageKey, snapshot.room.id);
      router.push(buildRoomHref(snapshot.room.id) as Route);
    } catch (error) {
      setDialogError(toUserFacingError(error));
    }
  }

  async function handleJoinRoom(code: string, password?: string) {
    if (!code.trim()) {
      setStatusMessage("请输入房间码。");
      return;
    }
    // Enter-key submits do not go through the disabled submit button, so a
    // double keypress would otherwise fire two concurrent join requests.
    if (joinInFlightRef.current) return;
    joinInFlightRef.current = true;

    primeRoomAudioFromUserGesture();
    try {
      const joined = await soqaroApi.joinRoomByCode(code.trim(), password);
      storeRoomSnapshotHandoff(buildRoomJoinBootstrapSnapshot(joined));
      window.localStorage.setItem(lastRoomStorageKey, joined.roomId);
      router.push(buildRoomHref(joined.roomId) as Route);
    } catch (error) {
      if (selectedRoom) {
        setDialogError(toUserFacingError(error));
      } else {
        setStatusMessage(toUserFacingError(error));
      }
    }    finally {
      joinInFlightRef.current = false;
    }
  }

  function openRoomDetails(room: RoomDirectoryItem) {
    if (room.room.id === effectiveAwayRoomId) {
      handleResumeAwayRoom();
      return;
    }
    if (!activeSession) {
      setStatusMessage("进入房间需要先登录账号。");
      router.push(authEntryHref as Route);
      return;
    }
    setSelectedRoom(room);
    setDialogError(null);
  }

  const visibleRooms = useMemo(() => (Array.isArray(availableRooms) ? availableRooms : emptyRooms).filter((room) => roomTypeFilter === "all" || room.room.roomType === roomTypeFilter)
      .sort((left, right) =>
      right.room.directoryOnlineMemberCount - left.room.directoryOnlineMemberCount
    ),
    [availableRooms, roomTypeFilter]
  );

  if (!hydrated) {
    return <div className="min-h-[calc(100*var(--app-dvh))] bg-background" />;
  }

  return (
    <main className="workspace-page home-workspace-page hide-scrollbar relative flex flex-col overflow-y-auto selection:bg-accent/30 selection:text-white pb-[calc(var(--room-mobile-bottom-inset)+2rem)] md:pb-[calc(12rem+env(safe-area-inset-bottom))] md:pl-[var(--app-sidebar-width)]">

      {showSidebar ? (
        <AppSidebar
          activeItem="home"
          hasBottomPlayer={hasBottomPlayer}
        />
      ) : null}

      {effectiveAwayRoomId && showSidebar ? <AwayRoomReturnButton onClick={handleResumeAwayRoom} /> : null}


      <section className="workspace-page__inner home-centered-workspace relative flex w-full shrink-0 flex-col gap-4 pt-[calc(0.75rem+env(safe-area-inset-top))] md:gap-5">
        <AnnouncementBanner />

        {/* Mobile Header: aligned with desktop actions, restrained & compact without divider */}
        <header className="flex items-center justify-between gap-3 md:hidden">
          <div>
            <h1 className="workspace-page__title text-lg font-semibold tracking-tight text-foreground">房间大厅</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent-hover active:scale-95 cursor-pointer"
              onClick={() => openCreateRoom("public")}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>创建</span>
            </button>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-surface-border bg-surface px-2.5 text-xs font-medium text-foreground-muted shadow-sm transition-all hover:bg-surface-hover hover:text-foreground active:scale-95 cursor-pointer"
              onClick={openJoinDialog}
              type="button"
            >
              <span>房间码</span>
            </button>
            <button
              aria-label="刷新房间列表"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface text-foreground-muted shadow-sm transition-all hover:bg-surface-hover hover:text-foreground active:scale-95 cursor-pointer"
              onClick={() => startTransition(() => void refreshAvailableRooms())}
              title="刷新房间列表"
              type="button"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            </button>
            <Link
              aria-label="打开个人中心"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface text-foreground-muted shadow-sm transition-all hover:bg-surface-hover hover:text-foreground active:scale-95"
              href="/app/profile"
            >
              <User className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        {/* Mobile Filter Tabs directly under header */}
        <div className="flex items-center gap-1 rounded-xl p-1 border border-surface-border/80 bg-surface/40 shadow-2xs backdrop-blur-md md:hidden" role="tablist" aria-label="房间类型筛选">
          {(["all", "interactive", "request", "radio"] as const).map((roomType) => {
            const isSelected = roomTypeFilter === roomType;
            return (
              <button
                aria-selected={isSelected}
                className={`flex-1 flex min-h-8 whitespace-nowrap items-center justify-center rounded-lg px-2.5 py-1 text-xs transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-surface-elevated text-foreground font-semibold shadow-xs border border-surface-border"
                    : "border border-transparent text-foreground-muted hover:text-foreground hover:bg-surface-hover/40"
                }`}
                key={roomType}
                onClick={() => setRoomTypeFilter(roomType)}
                role="tab"
                type="button"
              >
                {roomType === "all" ? "全部" : roomTypeLabel(roomType)}
              </button>
            );
          })}
        </div>

        {/* Desktop Filter Tabs & Action Buttons */}
        <div className="hidden items-center justify-between gap-4 md:flex">
          <div className="flex items-center gap-1 rounded-xl border border-surface-border/80 p-1 bg-surface/40 shadow-2xs backdrop-blur-md" role="tablist" aria-label="房间类型筛选">
            {(["all", "interactive", "request", "radio"] as const).map((roomType) => {
              const isSelected = roomTypeFilter === roomType;
              return (
                <button
                  aria-selected={isSelected}
                  className={`flex h-8 whitespace-nowrap items-center justify-center rounded-lg px-3.5 text-xs transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-surface-elevated text-foreground font-semibold shadow-xs border border-surface-border"
                      : "border border-transparent text-foreground-muted hover:text-foreground hover:bg-surface-hover/40"
                  }`}
                  key={roomType}
                  onClick={() => setRoomTypeFilter(roomType)}
                  role="tab"
                  type="button"
                >
                  {roomType === "all" ? "全部" : roomTypeLabel(roomType)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              data-testid="create-public-room"
              size="sm"
              className="h-8 rounded-lg px-3.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white shadow-xs transition-colors"
              onClick={() => openCreateRoom("public")}
              type="button"
            >
              创建房间
            </Button>
            <Button
              data-testid="open-join-room-dialog"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-3 border border-surface-border bg-surface hover:bg-surface-hover text-foreground text-xs font-medium transition-colors"
              onClick={openJoinDialog}
              type="button"
            >
              输入房间码加入
            </Button>
            <Button
              aria-label="刷新房间列表"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-foreground-muted hover:text-foreground hover:bg-surface text-xs transition-colors"
              onClick={() => startTransition(() => void refreshAvailableRooms())}
              type="button"
            >
              刷新
            </Button>
          </div>
        </div>

        {/* Room Cards Container */}
        <div className="min-h-[240px]">
          <div className="mb-3 flex items-center justify-between md:hidden">
            <h2 className="text-xs font-semibold text-foreground tracking-tight">房间列表</h2>
            <span className="text-xs text-foreground-muted">{visibleRooms.length} 个</span>
          </div>
          {visibleRooms.length ? (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3 xl:gap-4">
              {visibleRooms.map((item) => (
                <RoomDirectoryCard
                  key={item.room.id}
                  room={item}
                  onOpen={() => openRoomDetails(item)}
                />
              ))}
            </div>
          ) : !roomsLoaded ? (
            <div className="flex min-h-[260px] items-center justify-center py-14 text-center text-sm text-foreground-muted">
              正在加载房间…
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center py-14 text-center opacity-85 rounded-xl border border-surface-border/50 bg-surface/30">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-surface-border bg-surface text-foreground-muted">
                <LayoutGrid className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">当前没有房间</h3>
              <p className="max-w-sm text-sm text-foreground-muted">
                你可以先创建一个房间等待其他人加入，或者稍后回来刷新列表。
              </p>
            </div>
          )}
        </div>
      </section>

      {createDialogOpen ? (
        <CreateRoomDialogModal
          defaultRoomName={activeSession?.nickname ? `${activeSession.nickname}的音乐房间` : "音乐房间"}
          dialogError={dialogError}
          initialVisibility={createFormVisibility}
          isPending={isPending}
          onClose={() => setCreateDialogOpen(false)}
          onSubmit={(form) => {
            startTransition(() => void handleCreateRoom(form));
          }}
        />
      ) : null}

      {joinDialogOpen ? (
        <JoinCodeDialogModal
          isPending={isPending}
          onClose={() => setJoinDialogOpen(false)}
          onSubmit={(code) => {
            const room = availableRooms.find(
              (item) => item.room.joinCode.toUpperCase() === code.trim().toUpperCase()
            );
            if (room) {
              setJoinDialogOpen(false);
              openRoomDetails(room);
              return;
            }
            if (isPending || joinInFlightRef.current) return;
            startTransition(() => void handleJoinRoom(code));
          }}
          statusMessage={statusMessage}
        />
      ) : null}

      {selectedRoom ? (
        <SelectedRoomDialogModal
          dialogError={dialogError}
          isPending={isPending}
          onClose={() => setSelectedRoom(null)}
          onConfirm={(password) => {
            setDialogError(null);
            startTransition(async () => {
              try {
                await handleJoinRoom(selectedRoom.room.joinCode, password || undefined);
              } catch (error) {
                setDialogError(toUserFacingError(error));
              }
            });
          }}
          room={selectedRoom}
        />
      ) : null}
    </main>
  );
}

function primeRoomAudioFromUserGesture() {
  // Start the shared context while the join/create click still carries a
  // transient user activation. The room route may receive a playing snapshot
  // immediately after navigation, before the listener has another gesture.
  void roomAudioOutput.primeOutputs({ localAudio: null });
}

