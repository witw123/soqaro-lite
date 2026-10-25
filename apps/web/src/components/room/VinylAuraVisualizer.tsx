"use client";

import { useEffect, useRef, useState } from "react";
import { audioVisualizerStore } from "@/features/playback/audio-visualizer-store";
import { resolveCanvasFrameDelayMs } from "@/features/playback/render-scheduler";
import { withAlpha } from "@/components/bottom-player/artwork-colors";

type VinylAuraVisualizerProps = {
  isPlaying: boolean;
  frozen?: boolean;
  accentColor?: string;
  reducedMotion?: boolean;
  maxDevicePixelRatio?: number;
};

export function VinylAuraVisualizer({
  isPlaying,
  frozen = false,
  accentColor = "rgb(161 161 170)",
  reducedMotion = false,
  maxDevicePixelRatio = 1.5
}: VinylAuraVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    if (frozen) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const frameDelayMs = resolveCanvasFrameDelayMs({
      isPageVisible,
      isPlaying,
      reducedMotion
    });
    if (frameDelayMs === null) {
      return;
    }

    let animationFrameId: number | null = null;
    let timeoutId: number | null = null;
    let phaseOffset = 0;

    // Smoothed values for fluid animation
    let smoothedPeak = 0;
    let smoothedAverage = 0;

    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? Math.min(maxDevicePixelRatio, window.devicePixelRatio || 1) : 1;
      const width = Math.max(1, Math.floor(bounds.width * dpr));
      const height = Math.max(1, Math.floor(bounds.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: bounds.width, height: bounds.height };
    };

    const scheduleNextFrame = () => {
      if (!isPlaying || reducedMotion) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        animationFrameId = window.requestAnimationFrame(draw);
      }, frameDelayMs);
    };

    const draw = () => {
      const { width, height } = updateSize();

      let currentPeak = 0;
      let currentAverage = 0;

      const samples = audioVisualizerStore.samples;
      if (samples && samples.length > 0) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(0, samples[i]);
          sum += s;
          if (s > currentPeak) currentPeak = s;
        }
        currentAverage = sum / samples.length;
      }

      // Smooth the energy values
      smoothedPeak += (currentPeak - smoothedPeak) * (reducedMotion ? 0.05 : 0.15);
      smoothedAverage += (currentAverage - smoothedAverage) * (reducedMotion ? 0.05 : 0.1);

      // Advance phase for drifting organic movement
      if (isPlaying && !reducedMotion) {
        phaseOffset += Math.max(0.002, smoothedAverage * 0.02);
      }

      context.clearRect(0, 0, width, height);

      // We render a circular plasma ring around the center of the canvas
      context.globalCompositeOperation = "screen";

      const centerX = width / 2;
      const centerY = height / 2;
      const baseScale = isPlaying ? 0.3 : 0.1;
      const boostScale = isPlaying ? 1.0 : 0;

      const blobScale = baseScale + smoothedPeak * boostScale * 0.8;
      
      const minRadius = Math.min(width, height) * 0.35 + (smoothedAverage * 12);
      const blobRadius = minRadius + (Math.min(width, height) * 0.12 * blobScale);

      // Main Halo Aura
      const grad1 = context.createRadialGradient(centerX, centerY, minRadius * 0.5, centerX, centerY, blobRadius * 1.15);
      grad1.addColorStop(0, withAlpha(accentColor, 0)); // Inner hole is transparent so vinyl sits cleanly
      grad1.addColorStop(0.3, withAlpha(accentColor, 0.22 + smoothedAverage * 0.35)); // Peak color ring
      grad1.addColorStop(0.7, withAlpha(accentColor, 0.08 + smoothedAverage * 0.15)); // Smooth palette falloff
      grad1.addColorStop(1, withAlpha(accentColor, 0));
      
      context.fillStyle = grad1;
      context.beginPath();
      context.arc(centerX, centerY, blobRadius * 1.15, 0, Math.PI * 2);
      context.fill();

      // Deformed/Wavy Edge
      context.save();
      context.translate(centerX, centerY);
      
      const numPoints = samples.length > 0 ? Math.min(samples.length, 32) : 16;
      context.beginPath();
      
      for (let i = 0; i <= numPoints; i++) {
        const index = i % numPoints;
        const angle = (index / numPoints) * Math.PI * 2 + phaseOffset;
        // Extrude points based on the sample amplitude
        const sampleAmp = samples.length > 0 ? Math.max(0, samples[Math.floor((index / numPoints) * samples.length)]) : 0;
        
        const extrusion = isPlaying ? (sampleAmp * minRadius * 0.4) : (Math.sin(angle * 3 + phaseOffset) * 5);
        const pointRadius = minRadius * 0.9 + extrusion;
        
        const x = Math.cos(angle) * pointRadius;
        const y = Math.sin(angle) * pointRadius;
        
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          // A real cubic bezier smoother could be here, but simple line is performant enough for blurred blobs
          const prevIndex = (i - 1) % numPoints;
          const prevAngle = (prevIndex / numPoints) * Math.PI * 2 + phaseOffset;
          const prevSample = samples.length > 0 ? Math.max(0, samples[Math.floor((prevIndex / numPoints) * samples.length)]) : 0;
          const prevExtrusion = isPlaying ? (prevSample * minRadius * 0.4) : (Math.sin(prevAngle * 3 + phaseOffset) * 5);
          const prevPRadius = minRadius * 0.9 + prevExtrusion;
          
          const cpX = Math.cos((angle + prevAngle) / 2) * (pointRadius + prevPRadius) / 2 * 1.05;
          const cpY = Math.sin((angle + prevAngle) / 2) * (pointRadius + prevPRadius) / 2 * 1.05;
          context.quadraticCurveTo(cpX, cpY, x, y);
        }
      }
      
      context.closePath();
      context.lineWidth = 8 + smoothedPeak * 12;
      context.strokeStyle = withAlpha(accentColor, 0.16 + smoothedPeak * 0.3);
      const lineBlur = context.filter;
      context.filter = "blur(8px)";
      context.stroke();
      context.filter = lineBlur;
      
      context.fillStyle = withAlpha(accentColor, 0.04 + smoothedAverage * 0.12);
      context.fill();
      context.restore();

      scheduleNextFrame();
    };

    animationFrameId = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [accentColor, frozen, isPageVisible, isPlaying, reducedMotion, maxDevicePixelRatio]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full rounded-full opacity-45 mix-blend-screen transition-opacity duration-1000 scale-[1.04]"
      data-testid="vinyl-aura-visualizer"
      style={{ clipPath: "circle(50% at 50% 50%)" }}
    />
  );
}
