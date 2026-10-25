import { PlaylistsWorkspacePage } from "@/components/playlists";

export const dynamic = "force-static";

export default function LocalPlaylistsPage() {
  return <PlaylistsWorkspacePage playlistView="local" />;
}
