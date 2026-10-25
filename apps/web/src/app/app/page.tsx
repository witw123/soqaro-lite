import { RoomsHomePage } from "@/components/room-home";

export const revalidate = 0;

export default function AppEntryPage() {
  return <RoomsHomePage showSidebar={false} />;
}
