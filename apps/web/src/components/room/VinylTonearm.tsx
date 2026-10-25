"use client";

type VinylTonearmProps = {
  isPlaying: boolean;
  frozen?: boolean;
  accentColor?: string;
};

export function VinylTonearm({ isPlaying, frozen = false, accentColor }: VinylTonearmProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-30 flex flex-col items-center ${frozen ? "transition-none" : "transition-transform duration-500 ease-out"} ${isPlaying ? "rotate-[20deg]" : "-rotate-[15deg]"}`}
      style={{
        right: "-8%",
        top: "3%",
        width: "12%",
        height: "64%",
        transformOrigin: "12% 8%"
      }}
    >
      <div className="absolute top-0 z-10 flex aspect-square w-[18%] items-center justify-center rounded-full border-2 border-[#111] bg-gradient-to-br from-neutral-300 to-neutral-600 shadow-xl">
        <div className="aspect-square w-[42%] rounded-full bg-[#111] shadow-inner" />
      </div>
      <div className="h-[78%] w-[28%] bg-gradient-to-r from-neutral-400 via-neutral-200 to-neutral-500 pt-[12%] shadow-lg" />
      <div
        className="relative ml-[-35%] h-[24%] w-[105%] skew-x-[15deg] border-accent border-b-2 bg-[#222] shadow-2xl"
        style={accentColor ? { borderBottomColor: accentColor } : undefined}
      >
        <div className="absolute right-0 top-2 h-2 w-2 rounded-full bg-red-500/80" />
      </div>
    </div>
  );
}
