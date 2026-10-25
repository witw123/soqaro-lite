import { RoomsHomePage } from "@/components/room-home";

export const dynamic = "force-static";

export default function AppEntryPage() {
  return <RoomsHomePage showSidebar={false} />;
}
