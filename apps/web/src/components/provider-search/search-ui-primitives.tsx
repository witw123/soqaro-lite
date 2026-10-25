import type { BilibiliTrackCandidate, NeteaseTrackCandidate, QqMusicTrackCandidate } from "@soqaro/shared";
import {
  Search,
  Heart,
  ListPlus,
  Download,
  Loader2,
  ArrowLeft,
  X,
  ChevronRight,
  Music
} from "lucide-react";
import { SoqaroApiError } from "@/lib/network/soqaro-api";
import { MediaArtwork } from "@/components/ui/media-artwork";

export type Provider = "netease" | "qqmusic" | "bilibili";
export type Track = NeteaseTrackCandidate | QqMusicTrackCandidate | BilibiliTrackCandidate;

export function albumKey(provider: Provider, providerAlbumId: string) {
  return `${provider}:${providerAlbumId}`;
}

export function SearchTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      aria-selected={active}
      className={`relative min-h-10 px-2.5 pb-2 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
        active ? "text-foreground font-semibold" : "text-foreground-muted hover:text-foreground"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <span>{children}</span>
      <span
        className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-all duration-200 ${
          active ? "bg-accent opacity-100 scale-100" : "bg-transparent opacity-0 scale-75"
        }`}
      />
    </button>
  );
}

export function Artwork({
  alt,
  src,
  size,
  className = ""
}: {
  alt: string;
  src: string | null | undefined;
  size: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "h-9 w-9 rounded-lg border border-surface-border", md: "h-20 w-20 rounded-xl", lg: "rounded-2xl" };
  return (
    <MediaArtwork
      alt={alt}
      src={src}
      className={className}
      containerClassName={`${sizes[size]} ${className}`}
      rounded="none"
      fallbackIcon={<Icon name="music" />}
    />
  );
}

export function SearchEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface px-6 text-center">
      <span className="text-foreground-muted/50"><Icon name="search" /></span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1.5 text-xs text-foreground-muted/70">{description}</p>
    </div>
  );
}

export function TrackAlbumLink({
  track,
  pending,
  onAlbum,
  className = ""
}: {
  track: Track;
  pending: string | null;
  onAlbum: (track: Track) => Promise<void>;
  className?: string;
}) {
  if (!track.album) return <span className={`${className} text-foreground-muted/50`}>未知专辑</span>;
  return (
    <button
      className={`${className} truncate text-left text-accent/80 transition hover:text-accent`}
      disabled={pending !== null}
      onClick={() => void onAlbum(track)}
      title={`查看专辑 ${track.album}`}
      type="button"
    >
      {track.album}
    </button>
  );
}

export function Icon({
  name,
  filled = false,
  className = "w-4 h-4"
}: {
  name: "search" | "heart" | "arrow-left" | "close" | "music" | "chevron-right" | "playlist-add" | "download" | "loading";
  filled?: boolean;
  className?: string;
}) {
  if (name === "search") return <Search className={className} />;
  if (name === "heart") return <Heart className={className} fill={filled ? "currentColor" : "none"} />;
  if (name === "playlist-add") return <ListPlus className={className} />;
  if (name === "download") return <Download className={className} />;
  if (name === "loading") return <Loader2 className={`animate-spin ${className}`} />;
  if (name === "arrow-left") return <ArrowLeft className={className} />;
  if (name === "close") return <X className={className} />;
  if (name === "chevron-right") return <ChevronRight className={className} />;
  return <Music className={className} />;
}

export function toProviderErrorMessage(error: unknown, provider: Provider) {
  if (error instanceof SoqaroApiError) {
    if (error.code === "NETEASE_ACCOUNT_REQUIRED" || error.code === "QQMUSIC_ACCOUNT_REQUIRED") return "请先在我的页面绑定对应平台账号。";
    if (error.code === "NETEASE_AUTH_EXPIRED" || error.code === "QQMUSIC_AUTH_EXPIRED") return "平台登录已失效，请回我的页面重新绑定。";
    if (error.code === "NETEASE_DISABLED" || error.code === "QQMUSIC_DISABLED") return "该音乐平台当前未启用。";
    if (error.code === "QQMUSIC_TRACK_NOT_FOUND") return "该歌曲没有可用的公开音频，可能受到 VIP 或版权限制；免费歌曲也无法播放时请重新绑定 QQ 音乐。";
    return error.message;
  }
  return error instanceof Error ? error.message : `${provider === "netease" ? "网易云" : provider === "qqmusic" ? "QQ 音乐" : "哔哩哔哩"}操作失败，请稍后重试。`;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  className = ""
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className={`mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground-muted ${className}`}>
      <span className="tabular-nums">
        共 {total} 项结果，第 {page} / {totalPages} 页
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-surface-border bg-surface px-2.5 py-1 font-medium transition hover:bg-surface-hover hover:text-foreground disabled:opacity-35 disabled:cursor-not-allowed select-none"
        >
          上一页
        </button>
        <span className="min-w-6 text-center text-foreground font-semibold tabular-nums">{page}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-surface-border bg-surface px-2.5 py-1 font-medium transition hover:bg-surface-hover hover:text-foreground disabled:opacity-35 disabled:cursor-not-allowed select-none"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
