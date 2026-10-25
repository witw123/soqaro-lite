"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RoomsHomePage } from "@/components/room-home";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app");
  }, [router]);

  return <RoomsHomePage showSidebar={false} />;
}
