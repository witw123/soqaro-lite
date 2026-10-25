"use client";

import React, { useState, useEffect } from "react";
import { getArtworkSourceUrl } from "@/components/bottom-player/artwork-colors";
import { cn } from "@/lib/utils";

export interface MediaArtworkProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  alt: string;
  fallbackIcon?: React.ReactNode;
  aspectRatio?: "square" | "video" | "auto";
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  containerClassName?: string;
}

const roundedMap = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full"
};

const aspectMap = {
  square: "aspect-square",
  video: "aspect-video",
  auto: ""
};

export const MediaArtwork = React.forwardRef<HTMLImageElement, MediaArtworkProps>(
  (
    {
      src,
      alt,
      fallbackIcon = "♪",
      aspectRatio = "square",
      rounded = "lg",
      className = "",
      containerClassName = "",
      loading = "lazy",
      decoding = "async",
      ...props
    },
    ref
  ) => {
    const [hasError, setHasError] = useState(false);
    const source = src ? getArtworkSourceUrl(src) : null;

    useEffect(() => {
      setHasError(false);
    }, [src]);

    const containerClasses = cn(
      "relative overflow-hidden bg-surface border border-surface-border select-none shrink-0",
      aspectMap[aspectRatio],
      roundedMap[rounded],
      containerClassName
    );

    if (!source || hasError) {
      return (
        <div
          role="img"
          aria-label={alt || "专辑封面"}
          className={cn(
            containerClasses,
            "flex items-center justify-center text-foreground-muted/60 font-sans font-medium",
            className
          )}
        >
          {fallbackIcon}
        </div>
      );
    }

    return (
      <div className={containerClasses}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={ref}
          src={source}
          alt={alt || "专辑封面"}
          loading={loading}
          decoding={decoding}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-200",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

MediaArtwork.displayName = "MediaArtwork";
