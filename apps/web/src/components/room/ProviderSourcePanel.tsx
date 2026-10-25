"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type {
  AuthSession,
  NeteaseAccountStatus,
  NeteaseTrackCandidate,
  ProviderTrackCandidate,
  QqMusicAccountStatus,
  QqMusicTrackCandidate
} from "@soqaro/shared";
import { formatDuration } from "@/lib/domain/soqaro-ui";
import {
  SoqaroApiError,
  soqaroApi
} from "@/lib/network/soqaro-api";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";

const qualityLabels = {
  standard: "标准",
  high: "高品",
  exhigh: "极高",
  lossless: "无损",
  hires: "Hi-Res"
} as const;

const accessLabels = {
  free: "免费",
  vip: "VIP",
  paid: "付费"
} as const;

export type ProviderSourceKind = "netease" | "qqmusic";

type ProviderAccountLike = NeteaseAccountStatus | QqMusicAccountStatus;

/**
 * 平台适配配置:两个 provider 面板的全部差异都收敛在这里。
 * 面板主体(QR 绑定轮询、搜索、导入、解绑与完整 UI)只有这一份实现。
 */
type ProviderSourceAdapter<TrackT extends ProviderTrackCandidate, AccountT extends ProviderAccountLike> = {
  label: string;
  cssPrefix: string;
  nicknameFallback: string;
  qrHint: string;
  cachedProvider: ProviderSourceKind;
  disconnectedAccount: AccountT;
  errorMessages: Record<string, string>;
  stopQrPollingCodes: string[];
  api: {
    getAccount: () => Promise<AccountT>;
    getQrStatus: (attemptId: string) => Promise<{ status: string; account?: AccountT; message?: string }>;
    startQrLogin: () => Promise<{ attemptId: string; qrimg: string; expiresAt: string }>;
    searchTracks: (query: string) => Promise<{ items: TrackT[] }>;
    disconnect: () => Promise<unknown>;
  };
};

const neteaseAdapter: ProviderSourceAdapter<NeteaseTrackCandidate, NeteaseAccountStatus> = {
  label: "网易云音乐",
  cssPrefix: "netease",
  nicknameFallback: "网易云账号",
  qrHint: "请使用网易云音乐扫码确认。",
  cachedProvider: "netease",
  disconnectedAccount: {
    connected: false,
    neteaseUserId: null,
    nickname: null,
    avatarUrl: null,
    lastValidatedAt: null
  },
  errorMessages: {
    NETEASE_ACCOUNT_REQUIRED: "请先绑定网易云账号。",
    NETEASE_AUTH_EXPIRED: "网易云登录已失效，请重新绑定。",
    NETEASE_DISABLED: "网易云功能当前未启用。",
    NETEASE_IMPORT_TOO_LARGE: "歌曲文件过大，无法导入。",
    NETEASE_AUDIO_UNSUPPORTED: "网易云返回了当前播放器不支持的音频格式。"
  },
  stopQrPollingCodes: ["UNAUTHORIZED", "NETEASE_DISABLED", "NETEASE_AUTH_EXPIRED", "NETEASE_QR_EXPIRED"],
  api: {
    getAccount: () => soqaroApi.getNeteaseAccount(),
    getQrStatus: (attemptId) => soqaroApi.getNeteaseQrStatus(attemptId),
    startQrLogin: () => soqaroApi.startNeteaseQrLogin(),
    searchTracks: (query) => soqaroApi.searchNeteaseTracks(query),
    disconnect: () => soqaroApi.disconnectNeteaseAccount()
  }
};

const qqmusicAdapter: ProviderSourceAdapter<QqMusicTrackCandidate, QqMusicAccountStatus> = {
  label: "QQ 音乐",
  cssPrefix: "qqmusic",
  nicknameFallback: "QQ 音乐账号",
  qrHint: "请使用 QQ 音乐扫码确认。",
  cachedProvider: "qqmusic",
  disconnectedAccount: {
    connected: false,
    qqMusicUserId: null,
    nickname: null,
    avatarUrl: null,
    lastValidatedAt: null
  },
  errorMessages: {
    QQMUSIC_ACCOUNT_REQUIRED: "请先绑定 QQ 音乐账号。",
    QQMUSIC_AUTH_EXPIRED: "QQ 音乐登录已失效，请重新绑定。",
    QQMUSIC_DISABLED: "QQ 音乐功能当前未启用。",
    QQMUSIC_TRACK_NOT_FOUND: "该歌曲没有可用的公开音频，可能受到 VIP 或版权限制，请换一首歌曲重试。",
    QQMUSIC_UNAVAILABLE: "QQ 音乐服务暂时不可用，请稍后重试。",
    QQMUSIC_IMPORT_TOO_LARGE: "歌曲文件过大，无法导入。",
    QQMUSIC_AUDIO_UNSUPPORTED: "QQ 音乐返回了当前播放器不支持的音频格式。"
  },
  stopQrPollingCodes: ["UNAUTHORIZED", "QQMUSIC_DISABLED", "QQMUSIC_AUTH_EXPIRED", "QQMUSIC_QR_EXPIRED"],
  api: {
    getAccount: () => soqaroApi.getQqMusicAccount(),
    getQrStatus: (attemptId) => soqaroApi.getQqMusicQrStatus(attemptId),
    startQrLogin: () => soqaroApi.startQqMusicQrLogin(),
    searchTracks: (query) => soqaroApi.searchQqMusicTracks(query),
    disconnect: () => soqaroApi.disconnectQqMusicAccount()
  }
};

type ProviderSourcePanelProps<TrackT extends ProviderTrackCandidate> = {
  activeSession: AuthSession | null;
  onImportTrack?: (track: TrackT) => Promise<void>;
  mode?: "full" | "account";
};

function ProviderSourcePanelBase<TrackT extends ProviderTrackCandidate, AccountT extends ProviderAccountLike>({
  adapter,
  activeSession,
  onImportTrack,
  mode = "full"
}: {
  adapter: ProviderSourceAdapter<TrackT, AccountT>;
  activeSession: AuthSession | null;
  onImportTrack?: (track: TrackT) => Promise<void>;
  mode?: "full" | "account";
}) {
  const [account, setAccount] = useState<ProviderAccountLike | null>(null);
  const [qrSession, setQrSession] = useState<{
    attemptId: string;
    qrimg: string;
    expiresAt: string;
  } | null>(null);
  const [keywords, setKeywords] = useState("");
  const [results, setResults] = useState<TrackT[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSession) {
      setAccount(null);
      return;
    }

    let cancelled = false;
    void adapter.api.getAccount()
      .then((nextAccount) => {
        if (!cancelled) {
          setAccount(nextAccount);
          setErrorMessage(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(toProviderErrorMessage(adapter, error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSession, adapter]);

  useEffect(() => {
    if (!qrSession || !activeSession) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const status = await adapter.api.getQrStatus(qrSession.attemptId);
        if (cancelled) return;
        if (status.status === "connected" && status.account) {
          setAccount(status.account);
          setQrSession(null);
          setErrorMessage(null);
          setPendingAction(null);
          return;
        }
        if (status.status === "expired" || status.status === "failed") {
          setQrSession(null);
          setPendingAction(null);
          setErrorMessage(status.message ?? "二维码已失效，请重新生成。");
          return;
        }
        setErrorMessage(null);
        timer = setTimeout(() => void poll(), 2000);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toProviderErrorMessage(adapter, error));
          if (shouldStopQrPolling(adapter, error)) {
            setQrSession(null);
            setPendingAction(null);
            return;
          }
          timer = setTimeout(() => void poll(), 2000);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeSession, qrSession, adapter]);

  if (!activeSession) {
    return null;
  }

  const displayedAccount = account;

  const startQrLogin = async () => {
    setPendingAction("qr");
    setErrorMessage(null);
    try {
      setQrSession(await adapter.api.startQrLogin());
    } catch (error) {
      setPendingAction(null);
      setErrorMessage(toProviderErrorMessage(adapter, error));
    }
  };

  const searchTracks = async (queryText?: string) => {
    const query = (queryText ?? keywords).trim();
    if (!query || pendingAction) return;
    setPendingAction("search");
    setErrorMessage(null);
    try {
      const response = await adapter.api.searchTracks(query);
      setResults(response.items);
    } catch (error) {
      setErrorMessage(toProviderErrorMessage(adapter, error));
    } finally {
      setPendingAction(null);
    }
  };

  const importTrack = async (track: TrackT) => {
    if (pendingAction) return;
    setPendingAction(`import:${track.providerTrackId}`);
    setErrorMessage(null);
    try {
      if (!onImportTrack) return;
      await onImportTrack(track);
    } catch (error) {
      setErrorMessage(toProviderErrorMessage(adapter, error));
    } finally {
      setPendingAction(null);
    }
  };

  const disconnect = async () => {
    if (pendingAction) return;
    setPendingAction("disconnect");
    setErrorMessage(null);
    try {
      await adapter.api.disconnect();
      setAccount(adapter.disconnectedAccount);
      setResults([]);
    } catch (error) {
      setErrorMessage(toProviderErrorMessage(adapter, error));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-4 rounded-xl border border-surface-border bg-surface/40 p-3 sm:p-4"
      data-testid={`${adapter.cssPrefix}-source-panel`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{adapter.label}</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            {displayedAccount?.connected ? `已绑定 ${displayedAccount.nickname ?? adapter.nicknameFallback}` : `未绑定${adapter.label}账号`}
          </p>
        </div>
        {displayedAccount?.connected ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pendingAction !== null}
            onClick={() => void disconnect()}
            type="button"
          >
            解除绑定
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pendingAction !== null}
            onClick={() => void startQrLogin()}
            type="button"
          >
            {pendingAction === "qr" ? "生成中…" : "扫码绑定"}
          </Button>
        )}
      </div>

      {qrSession ? (
        <div className="flex flex-col items-center gap-3 border-t border-surface-border pt-4 sm:flex-row sm:items-start">
          <Image
            alt={`${adapter.label}登录二维码`}
            className="h-40 w-40 rounded-lg bg-white p-2"
            height={160}
            unoptimized
            src={qrSession.qrimg}
            width={160}
          />
          <div className="flex min-w-0 flex-col gap-2 text-xs text-foreground-muted">
            <span>{adapter.qrHint}</span>
            <span>二维码有效期至 {new Date(qrSession.expiresAt).toLocaleTimeString()}</span>
            <Button
              className="self-start"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQrSession(null);
                setPendingAction(null);
              }}
              type="button"
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {mode !== "account" ? (
        <>
          <SearchBar
            id={`${adapter.cssPrefix}-search-input`}
            value={keywords}
            onChange={setKeywords}
            onSubmit={(query) => void searchTracks(query)}
            onClear={() => setResults([])}
            placeholder="搜索歌曲、歌手或专辑"
            loading={pendingAction === "search"}
            showSearchButton
          />

          {results.length > 0 ? (
            <div className="flex items-center justify-between text-xs text-foreground-muted">
              <span>搜索结果</span>
              <span className="font-mono tabular-nums">{results.length} 首</span>
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className={`${adapter.cssPrefix}-results-scroll custom-scrollbar max-h-[min(28rem,calc(52*var(--app-dvh)))] overflow-y-auto overscroll-contain rounded-lg border border-surface-border sm:max-h-[min(32rem,calc(58*var(--app-dvh)))]`}>
              <div className="flex flex-col divide-y divide-surface-border">
              {results.map((track) => {
                const isImporting = pendingAction === `import:${track.providerTrackId}`;
                const accessLabel = track.access === "unknown" ? null : accessLabels[track.access];
                const qualityLabel = track.quality ? qualityLabels[track.quality] : "标准";
                return (
                  <article
                    className="flex min-h-[76px] min-w-0 flex-col gap-3 bg-background/40 px-3 py-3 transition-colors hover:bg-surface-hover/60 sm:flex-row sm:items-center sm:justify-between"
                    data-testid={`${adapter.cssPrefix}-search-result`}
                    data-track-id={track.providerTrackId}
                    key={track.providerTrackId}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium text-foreground">{track.title}</h3>
                      <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-foreground-muted">
                        <span className="min-w-0 truncate">{track.artist}{track.album ? ` / ${track.album}` : ""}</span>
                        <span className="shrink-0 font-mono tabular-nums text-foreground/70">{formatDuration(track.durationMs)}</span>
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground-muted">
                        {accessLabel ? <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">{accessLabel}</span> : null}
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5">{qualityLabel}</span>
                      </p>
                    </div>
                    {onImportTrack ? (
                      <Button
                        className="shrink-0 self-start sm:self-auto h-7 rounded-md px-2.5 text-xs font-medium border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15"
                        disabled={pendingAction !== null}
                        onClick={() => void importTrack(track)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {isImporting ? "加入中…" : "加入曲库"}
                      </Button>
                    ) : null}
                  </article>
                );
              })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function toProviderErrorMessage(adapter: { errorMessages: Record<string, string>; label: string }, error: unknown) {
  if (error instanceof SoqaroApiError) {
    const mapped = error.code ? adapter.errorMessages[error.code] : undefined;
    if (mapped) return mapped;
    if (error.code === "RATE_LIMITED") return "二维码请求过于频繁，请一分钟后再试。";
    return error.message;
  }
  return error instanceof Error ? error.message : `${adapter.label}操作失败，请稍后重试。`;
}

function shouldStopQrPolling(adapter: { stopQrPollingCodes: string[] }, error: unknown) {
  if (!(error instanceof SoqaroApiError)) {
    return false;
  }

  return adapter.stopQrPollingCodes.includes(error.code ?? "");
}

/** 网易云面板:类型安全的薄包装,行为全部在 ProviderSourcePanelBase。 */
export function NeteaseSourcePanel(props: ProviderSourcePanelProps<NeteaseTrackCandidate>) {
  return <ProviderSourcePanelBase adapter={neteaseAdapter} {...props} />;
}

/** QQ 音乐面板:类型安全的薄包装,行为全部在 ProviderSourcePanelBase。 */
export function QqMusicSourcePanel(props: ProviderSourcePanelProps<QqMusicTrackCandidate>) {
  return <ProviderSourcePanelBase adapter={qqmusicAdapter} {...props} />;
}
