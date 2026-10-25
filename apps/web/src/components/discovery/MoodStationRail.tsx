import React from "react";
import { DiscoverSection } from "./DiscoverSection";
import {
  MoonIcon,
  LaptopIcon,
  ZapIcon,
  MicIcon,
  SakuraIcon,
  LandmarkIcon,
  PlayIcon
} from "@/components/icons/DiscoverIcons";

export const moodStations = [
  {
    id: "night",
    title: "深夜",
    subtitle: "R&B 治愈慢调",
    keywords: ["夜听", "深夜", "治愈", "r&b", "soul", "放空"],
    icon: MoonIcon
  },
  {
    id: "focus",
    title: "专注",
    subtitle: "器乐 沉浸思考",
    keywords: ["专注", "学习", "工作", "轻音乐", "纯音乐", "lo-fi", "chill", "钢琴"],
    icon: LaptopIcon
  },
  {
    id: "energy",
    title: "律动",
    subtitle: "电子 节拍律动",
    keywords: ["电子", "edm", "摇滚", "rock", "舞曲", "能量"],
    icon: ZapIcon
  },
  {
    id: "morning",
    title: "清晨",
    subtitle: "民谣 清新苏醒",
    keywords: ["民谣", "清新", "吉他", "流行", "晨光"],
    icon: MicIcon
  },
  {
    id: "acg",
    title: "ACG",
    subtitle: "原声 日系流行",
    keywords: ["acg", "anime", "二次元", "动漫", "游戏", "j-pop"],
    icon: SakuraIcon
  },
  {
    id: "guofeng",
    title: "国风",
    subtitle: "民乐 古韵戏腔",
    keywords: ["国风", "古风", "仙侠", "华语", "戏腔", "新中式"],
    icon: LandmarkIcon
  }
];

export function MoodStationRail({
  onPlayStation,
  pending
}: {
  onPlayStation: (station: (typeof moodStations)[0]) => Promise<void>;
  pending: string | null;
}) {
  return (
    <DiscoverSection
      title="场景电台"
      subtitle="随时切入适合当前状态的流式旋律"
    >
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {moodStations.map((station) => {
          const IconComp = station.icon;
          const isPending = pending === `mood:${station.id}`;
          return (
            <button
              key={station.id}
              type="button"
              disabled={pending !== null}
              onClick={() => void onPlayStation(station)}
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-surface-border bg-surface-elevated/70 p-2.5 sm:p-3 text-left transition-all duration-150 hover:bg-surface-hover hover:border-surface-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[80px] sm:min-h-[86px] shadow-xs active:scale-[0.98] cursor-pointer select-none"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-surface-border bg-surface text-foreground-muted transition-colors group-hover:text-foreground">
                  <IconComp className="w-3.5 h-3.5" />
                </div>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white shadow-xs opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                  {isPending ? (
                    <span className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <PlayIcon className="w-2.5 h-2.5 ml-0.5" />
                  )}
                </span>
              </div>
              <div className="mt-1.5">
                <p className="text-xs sm:text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent">
                  {station.title}
                </p>
                <p className="mt-0.5 text-xs text-foreground-muted truncate">
                  {station.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </DiscoverSection>
  );
}
