"use client";

type AwayRoomReturnButtonProps = {
  onClick: () => void;
};

export function AwayRoomReturnButton({ onClick }: AwayRoomReturnButtonProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <button
        aria-label="返回暂离房间"
        className="light-overlay-control pointer-events-auto absolute left-3 top-[calc(env(safe-area-inset-top)+5rem)] flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200/60 bg-amber-200/15 text-amber-100 shadow-lg shadow-amber-300/10 backdrop-blur-xl transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-amber-300/20 hover:text-amber-50 hover:shadow-amber-300/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 md:left-[calc(var(--app-sidebar-width)+1rem)] md:top-4"
        data-testid="resume-away-room"
        onClick={onClick}
        title="返回暂离房间"
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="17"
          viewBox="0 0 24 24"
          width="17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="M15 5 8 12l7 7" />
          <path d="M8 12h12" />
        </svg>
      </button>
    </div>
  );
}
