"use client";

import { Suspense } from "react";

export const dynamic = "force-static";

export default function RoomEntryPage() {
  return (
    <Suspense fallback={null}>
      <RoomEntryContent />
    </Suspense>
  );
}

function RoomEntryContent() {
  return null;
}
