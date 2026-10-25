import { useState, useEffect, type CSSProperties } from "react";
import { getArtworkSourceUrl } from "./artwork-colors";

type SquareAlbumCoverProps = {
  artworkUrl: string | null;
  className?: string;
  style?: CSSProperties;
};

export function SquareAlbumCover({ artworkUrl, className = "", style }: SquareAlbumCoverProps) {
  const [loadError, setLoadError] = useState(false);
  const src = artworkUrl ? getArtworkSourceUrl(artworkUrl) : null;

  useEffect(() => {
    setLoadError(false);
  }, [artworkUrl]);

  const showImage = Boolean(src && !loadError);

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-surface border border-surface-border shadow-sm ${className}`}
      data-testid="square-album-cover"
      style={style}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          referrerPolicy="no-referrer"
          src={src!}
          onError={() => setLoadError(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6">
            <path d="M9 18V5l10-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="16" cy="16" r="3" />
          </svg>
        </div>
      )}
    </div>
  );
}
