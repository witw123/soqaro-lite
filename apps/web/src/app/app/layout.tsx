import type { ReactNode } from "react";
import { AppRouteShell } from "@/components/shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppRouteShell>{children}</AppRouteShell>;
}
