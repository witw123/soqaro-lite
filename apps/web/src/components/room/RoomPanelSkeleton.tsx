"use client";

export function RoomPanelSkeleton() {
  return (
    <div className="flex w-full flex-col gap-3 animate-pulse py-1">
      {/* Search / Upload mock bar */}
      <div className="h-10 w-full rounded-xl bg-white/[0.04]" />

      {/* Filter pills mock */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-white/[0.03]">
        <div className="h-7 rounded-md bg-white/[0.05]" />
        <div className="h-7 rounded-md bg-white/[0.03]" />
        <div className="h-7 rounded-md bg-white/[0.03]" />
      </div>

      {/* Track rows */}
      <div className="flex flex-col gap-1 rounded-xl overflow-hidden border border-white/[0.04] bg-white/[0.01]">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-2.5 border-b border-white/[0.03] last:border-b-0"
          >
            <div className="h-10 w-10 shrink-0 rounded-lg bg-white/[0.06]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div
                className="h-3.5 rounded bg-white/[0.06]"
                style={{ width: `${60 + ((index * 13) % 30)}%` }}
              />
              <div
                className="h-2.5 rounded bg-white/[0.04]"
                style={{ width: `${35 + ((index * 9) % 25)}%` }}
              />
            </div>
            <div className="flex items-center gap-1">
              <div className="h-7 w-7 rounded-md bg-white/[0.03]" />
              <div className="h-7 w-7 rounded-md bg-white/[0.03]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
