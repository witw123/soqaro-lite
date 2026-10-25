"use client";

import { useState } from "react";

type LocalAudioImportProps = {
  disabled?: boolean;
  onFilesSelected: (files: FileList | File[] | null) => Promise<void>;
  testId?: string;
};

export function LocalAudioImport({
  disabled = false,
  onFilesSelected,
  testId = "track-upload-input"
}: LocalAudioImportProps) {
  const [isImporting, setIsImporting] = useState(false);

  const handleFilesSelected = async (files: FileList | null) => {
    if (disabled || isImporting) return;
    setIsImporting(true);
    try {
      await onFilesSelected(files);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <label className={`group relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-surface-border bg-surface/30 p-4 text-center transition-[background-color,border-color] duration-200 ease-out sm:p-5 ${disabled || isImporting ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-foreground-muted/40 hover:bg-surface/60"}`}>
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-surface-border bg-surface text-foreground-muted shadow-xs transition-[background-color,color,transform] duration-200 ease-out group-hover:scale-105 group-hover:text-foreground">
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <span className="mb-1 text-sm font-semibold text-foreground">{isImporting ? "正在导入本地音频" : "导入本地音频"}</span>
      <span className="text-xs text-foreground-muted">点击选择文件，或直接拖拽到这里</span>
      <input
        accept=".flac,.wav,.mp3,audio/flac,audio/wav,audio/x-wav,audio/mpeg,audio/mp3"
        className="hidden"
        data-testid={testId}
        disabled={disabled || isImporting}
        multiple
        onChange={(event) => void handleFilesSelected(event.target.files)}
        type="file"
      />
    </label>
  );
}
