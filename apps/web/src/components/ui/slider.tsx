import * as React from "react";

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  value: number;
  max: number;
  min?: number;
  containerStyle?: React.CSSProperties;
  accentColor?: string;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className = "", containerStyle, value, max, min = 0, accentColor = "var(--accent, rgb(0 112 243))", ...props }, ref) => {
    const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
      <div style={containerStyle} className={`relative flex items-center w-full h-4 group cursor-pointer ${className}`}>
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 bg-surface-border rounded-full overflow-hidden">
          {/* Fill indicator */}
          <div
            className="h-full rounded-full transition-[width,background-color]"
            style={{
              width: `${percentage}%`,
              backgroundColor: accentColor
            }}
          />
        </div>
        {/* Thumb */}
        <div
          className="absolute h-3 w-3 bg-foreground rounded-full shadow-sm border border-surface-border opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all scale-75 group-hover:scale-100"
          style={{ left: `calc(${percentage}% - 6px)` }}
        />
        {/* Actual Input Range element overlaying it completely invisible */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          value={value}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";
