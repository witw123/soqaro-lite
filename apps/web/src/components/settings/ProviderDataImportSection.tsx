"use client";

import { useState } from "react";
import type { ProviderLibrarySnapshot } from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import {
  localPlaylistTrackId,
  toProviderTrackRecord,
  upsertLocalPlaylistTrack
} from "@/features/playlist/local-playlist";
import { soqaroApi } from "@/lib/network/soqaro-api";
import { useActiveSession } from "@/features/session/use-session-identity";
import { useProviderAccount } from "@/features/providers/use-provider-account";

type Provider = "netease" | "qqmusic";
type ImportKind = "likedTracks" | "collectedPlaylists" | "collectedAlbums" | "followedArtists";

const labels: Record<ImportKind, string> = {
  likedTracks: "喜欢的歌曲",
  collectedPlaylists: "收藏的歌单",
  collectedAlbums: "收藏的专辑",
  followedArtists: "关注的歌手"
};

export function ProviderDataImportSection() {
  const providers: Provider[] = ["netease", "qqmusic"];

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface/40 p-4 text-xs text-foreground-muted">
        当前没有启用第三方音乐平台，请在配置中启用网易云音乐或 QQ 音乐后再进行导入。
      </div>
    );
  }

  return (
    <div className="divide-y divide-surface-border">
      {providers.map((provider) => (
        <ProviderImporter key={provider} provider={provider} />
      ))}
    </div>
  );
}

function ProviderImporter({ provider }: { provider: Provider }) {
  const activeSession = useActiveSession();
  const { data: account } = useProviderAccount(activeSession?.userId, provider);
  const [snapshot, setSnapshot] = useState<ProviderLibrarySnapshot | null>(null);
  const [selected, setSelected] = useState<Record<ImportKind, boolean>>({
    likedTracks: true,
    collectedPlaylists: true,
    collectedAlbums: true,
    followedArtists: true
  });
  const [pending, setPending] = useState<"load" | "import" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const providerName = provider === "netease" ? "网易云音乐" : "QQ 音乐";

  async function load() {
    setPending("load");
    setMessage(null);
    try {
      if (!account?.connected) {
        setMessage(`尚未绑定${providerName}账号，请先在上方扫码绑定后再读取资料。`);
        return;
      }

      const res = provider === "netease"
        ? await soqaroApi.getNeteaseLibrary()
        : await soqaroApi.getQqMusicLibrary();

      setSnapshot(res);
      setMessage(`已读取${providerName}资料：${res.likedTracks.length} 首喜欢、${res.collectedPlaylists.length} 个歌单、${res.collectedAlbums.length} 张专辑、${res.followedArtists.length} 位歌手。`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : `读取${providerName}资料失败。`;
      if (errMsg.includes("bound again") || errMsg.includes("expired") || errMsg.includes("409")) {
        setMessage(`${providerName}登录凭据已过期或未绑定，请先在上方重新绑定账号。`);
      } else {
        setMessage(errMsg);
      }
    } finally {
      setPending(null);
    }
  }

  async function importSelected() {
    if (!snapshot) return;
    setPending("import");
    setMessage(null);
    try {
      let importedTracks = 0;
      let importedAlbums = 0;
      let importedArtists = 0;
      let importedPlaylists = 0;
      let failedItems = 0;

      if (selected.likedTracks) {
        for (const track of snapshot.likedTracks) {
          try {
            await soqaroApi.saveFavoriteTrack(track);
            importedTracks += 1;
          } catch {
            failedItems += 1;
          }
        }
      }

      if (selected.collectedAlbums) {
        for (const album of snapshot.collectedAlbums) {
          try {
            await soqaroApi.saveFavoriteAlbum(album);
            importedAlbums += 1;
          } catch {
            failedItems += 1;
          }
        }
      }

      if (selected.followedArtists) {
        for (const artist of snapshot.followedArtists) {
          try {
            await soqaroApi.saveFavoriteArtist(artist);
            importedArtists += 1;
          } catch {
            failedItems += 1;
          }
        }
      }

      if (selected.collectedPlaylists) {
        try {
          const existing = await soqaroApi.listMyPlaylists().catch(() => []);
          const existingKeys = new Set(
            existing.flatMap((playlist) => playlist.tags.filter((tag) => tag.startsWith("network:")))
          );

          for (const summary of snapshot.collectedPlaylists) {
            const key = `network:${summary.provider}:${summary.providerPlaylistId}`.slice(0, 40);
            if (existingKeys.has(key)) continue;

            try {
              const detail = summary.provider === "netease"
                ? await soqaroApi.getNeteasePlaylist(summary.providerPlaylistId)
                : await soqaroApi.getQqMusicPlaylist(summary.providerPlaylistId);

              const safeTags = ["network", key, ...(detail.tags ?? [])]
                .map((t) => t.trim().slice(0, 40))
                .filter(Boolean)
                .slice(0, 20);

              await soqaroApi.createPlaylist({
                title: (detail.title || "未命名歌单").trim().slice(0, 160),
                description: detail.description ? detail.description.trim().slice(0, 1000) : null,
                coverUrl: detail.artworkUrl ?? detail.tracks.find((track) => track.artworkUrl)?.artworkUrl ?? null,
                isCollaborative: false,
                tags: safeTags,
                trackIds: detail.tracks.map(localPlaylistTrackId)
              });

              for (const track of detail.tracks) {
                await upsertLocalPlaylistTrack(toProviderTrackRecord(track)).catch(() => undefined);
              }

              existingKeys.add(key);
              importedPlaylists += 1;
            } catch {
              failedItems += 1;
            }
          }
        } catch {
          failedItems += 1;
        }
      }

      const totalImported = importedTracks + importedAlbums + importedArtists + importedPlaylists;
      if (totalImported > 0) {
        const parts = [
          importedTracks > 0 ? `${importedTracks} 首歌曲` : "",
          importedAlbums > 0 ? `${importedAlbums} 张专辑` : "",
          importedArtists > 0 ? `${importedArtists} 位歌手` : "",
          importedPlaylists > 0 ? `${importedPlaylists} 个歌单` : ""
        ].filter(Boolean);
        setMessage(`已成功导入 ${parts.join("、")}${failedItems > 0 ? `（${failedItems} 项跳过或失败）` : ""}。`);
      } else {
        setMessage(failedItems > 0 ? `导入遇到错误，${failedItems} 项未能成功。` : "所选资料均已导入或已存在。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `导入${providerName}资料失败。`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{providerName}</p>
          <p className="mt-1 text-xs text-foreground-muted">平台资料不会自动写入项目。</p>
        </div>
        <Button disabled={pending !== null} onClick={() => void load()} size="sm" type="button" variant="outline">
          {pending === "load" ? "读取中" : snapshot ? "重新读取" : "查看资料"}
        </Button>
      </div>
      {snapshot ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(Object.keys(labels) as ImportKind[]).map((kind) => (
            <label className="flex cursor-pointer items-center justify-between gap-3 border border-surface-border px-3 py-2.5" key={kind}>
              <span className="text-xs text-foreground">{labels[kind]}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-foreground-muted">{snapshot[kind].length}</span>
                <input
                  aria-label={`导入${labels[kind]}`}
                  checked={selected[kind]}
                  className="h-4 w-4 accent-accent"
                  onChange={(event) => setSelected((current) => ({ ...current, [kind]: event.target.checked }))}
                  type="checkbox"
                />
              </span>
            </label>
          ))}
          <div className="flex items-center justify-end sm:col-span-2">
            <Button disabled={pending !== null || !Object.values(selected).some(Boolean)} onClick={() => void importSelected()} size="sm" type="button">
              {pending === "import" ? "正在导入" : "导入所选"}
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-xs text-foreground-muted" role="status">{message}</p> : null}
    </div>
  );
}
