"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useSessionIdentity } from "@/features/session/use-session-identity";
import { buildWorkspaceAuthHref } from "@/lib/domain/client-shell";
import { soqaroApi } from "@/lib/network/soqaro-api";
import { PersonalOverview } from "./PersonalOverview";
import { ListeningProfileOverview } from "./ListeningProfileOverview";
import { RoomCenterOverview } from "@/components/room-home";
import { NeteaseSourcePanel, QqMusicSourcePanel, BilibiliSourcePanel } from "@/components/room/ProviderSourcePanel";
import { ProviderDataImportSection } from "./ProviderDataImportSection";
import { TasteColdStartDialog } from "@/components/discovery/TasteColdStartDialog";
import {
  BarChartIcon,
  LandmarkIcon,
  RadioIcon
} from "@/components/icons/DiscoverIcons";

type ProfileTab = "taste" | "rooms" | "providers";

const tabList: Array<{
  id: ProfileTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "taste", label: "听歌画像", mobileLabel: "画像", icon: BarChartIcon },
  { id: "rooms", label: "房间足迹", mobileLabel: "房间", icon: RadioIcon },
  { id: "providers", label: "平台账号", mobileLabel: "平台", icon: LandmarkIcon }
];

export function ProviderAccountsPage() {
  const router = useRouter();
  const redirectTo = "/app/profile";
  const authEntryHref = buildWorkspaceAuthHref({ redirectTo });
  const { activeSession, clearIdentity, hydrated } = useSessionIdentity({
    sessionStorageKey: "soqaro-session",
    initialStatusMessage: ""
  });
  const [activeTab, setActiveTab] = useState<ProfileTab>("taste");
  const [showColdStartDialog, setShowColdStartDialog] = useState(false);

  async function handleLogout() {
    try {
      await soqaroApi.logout();
    } catch {
      // Clear the local session even when the server cannot be reached.
    }
    clearIdentity();
    router.replace(authEntryHref as Route);
  }

  if (!hydrated) {
    return <div className="min-h-[calc(100*var(--app-dvh))] bg-background" />;
  }

  if (!activeSession) {
    return (
      <main className="profile-page workspace-page hide-scrollbar relative overflow-y-auto selection:bg-accent/30 selection:text-white md:pl-60 lg:pb-28">
        <AppPageBackground />
        <div className="workspace-page__inner workspace-page__inner--wide relative z-10 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(var(--room-mobile-bottom-inset)+2rem)] sm:pt-6 md:pt-8 md:pb-24">
          <section className="mb-6 rounded-xl border border-surface-border bg-surface/40 p-6 backdrop-blur-md text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-surface border border-surface-border flex items-center justify-center text-foreground-muted mb-3.5">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
                <path d="M4.5 21a7.5 7.5 0 0 1 15 0" strokeWidth="1.8" />
              </svg>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-1">访客模式</h2>
            <p className="text-xs text-foreground-muted max-w-sm mb-5 leading-relaxed">
              登录账号后可同步音乐平台歌单、记录听歌画像并在房间中自由互动点歌。
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => router.push(authEntryHref as Route)}
                className="inline-flex h-8 items-center px-4 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-xs transition-colors active:scale-95 cursor-pointer"
              >
                立即登录 / 注册
              </button>
              <button
                type="button"
                onClick={() => router.push("/app" as Route)}
                className="inline-flex h-8 items-center px-3.5 rounded-lg border border-surface-border bg-surface hover:bg-surface-hover text-foreground text-xs font-medium transition-colors cursor-pointer"
              >
                返回房间大厅
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="profile-page workspace-page hide-scrollbar relative overflow-y-auto overflow-x-hidden w-full max-w-full selection:bg-accent/30 selection:text-white md:pl-60 lg:pb-28">
      <AppPageBackground />
      <div className="workspace-page__inner workspace-page__inner--wide w-full max-w-full overflow-hidden relative z-10 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(var(--room-mobile-bottom-inset)+2rem)] sm:pt-6 md:pt-8 md:pb-24">
        <PersonalOverview activeSession={activeSession} onLogout={handleLogout} />

        {/* Responsive Segmented Tab Navigation */}
        <div className="grid grid-cols-3 sm:inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-surface-border bg-surface mb-4 sm:mb-5 w-full sm:w-auto">
          {tabList.map(({ id, label, mobileLabel, icon: IconComp }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex sm:inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
                  isActive
                    ? "bg-surface-elevated text-foreground font-semibold shadow-2xs"
                    : "text-foreground-muted hover:text-foreground hover:bg-surface-hover"
                }`}
              >
                <IconComp className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{mobileLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "taste" && (
          <ListeningProfileOverview
            activeSession={activeSession}
            onOpenColdStart={() => setShowColdStartDialog(true)}
          />
        )}

        {activeTab === "rooms" && (
          <RoomCenterOverview activeSession={activeSession} />
        )}

        {activeTab === "providers" && (
          <div className="rounded-xl border border-surface-border bg-surface/40 p-3.5 sm:p-5 space-y-6">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">音乐平台账号</h3>
              <div className="grid min-w-0 gap-4 lg:grid-cols-3">
                <NeteaseSourcePanel activeSession={activeSession} mode="account" />
                <QqMusicSourcePanel activeSession={activeSession} mode="account" />
                <BilibiliSourcePanel activeSession={activeSession} />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">导入平台资料</h3>
              <ProviderDataImportSection />
            </section>
          </div>
        )}
      </div>

      {/* Taste Cold Start Dialog */}
      <TasteColdStartDialog
        isOpen={showColdStartDialog}
        onClose={() => setShowColdStartDialog(false)}
        onCompleted={() => {
          // Profile updates automatically via personalizationChangedEvent
        }}
      />
    </main>
  );
}

function AppPageBackground() {
  return <div aria-hidden="true" className="workspace-page-background" />;
}
