import { RoomsHomePage } from "@/components/room-home";
import { AppRouteShell } from "@/components/shell";

export default function RoomsPage() {
  return (
    <AppRouteShell>
      <RoomsHomePage showSidebar={false} />
    </AppRouteShell>
  );
}
