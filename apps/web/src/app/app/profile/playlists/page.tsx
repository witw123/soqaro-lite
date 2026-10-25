import { PlaylistsWorkspacePage } from "@/components/playlists";

export const revalidate = 0;

export default function LocalPlaylistsPage() {
  return <PlaylistsWorkspacePage playlistView="local" />;
}
