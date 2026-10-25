"use client";

import { useCallback, useEffect, useRef } from "react";

export function calculateAutoScrollSpeed(
  clientY: number,
  containerRect: { top: number; bottom: number },
  edgeThreshold = 64,
  maxSpeed = 22
): number {
  const containerHeight = containerRect.bottom - containerRect.top;
  if (containerHeight <= 0) return 0;

  const threshold = Math.max(16, Math.min(edgeThreshold, Math.floor(containerHeight / 3)));

  if (clientY < containerRect.top + threshold && clientY >= containerRect.top - 30) {
    const intensity = Math.max(0, Math.min(1.2, (containerRect.top + threshold - clientY) / threshold));
    return -Math.max(2, Math.min(maxSpeed, Math.round(intensity * maxSpeed)));
  }
  if (clientY > containerRect.bottom - threshold && clientY <= containerRect.bottom + 30) {
    const intensity = Math.max(0, Math.min(1.2, (clientY - (containerRect.bottom - threshold)) / threshold));
    return Math.max(2, Math.min(maxSpeed, Math.round(intensity * maxSpeed)));
  }
  return 0;
}

export function findScrollableContainer(element: HTMLElement | null): HTMLElement | null {
  if (typeof window === "undefined" || !element) return null;
  let curr: HTMLElement | null = element;
  while (curr) {
    const style = window.getComputedStyle(curr);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return curr;
    }
    curr = curr.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement || null;
}

export function findScrollableParent(element: HTMLElement | null): HTMLElement | null {
  return findScrollableContainer(element?.parentElement ?? null);
}

export function getContainerViewportRect(container: HTMLElement): { top: number; bottom: number } {
  if (
    typeof document !== "undefined" &&
    (container === document.documentElement ||
      container === document.body ||
      container === document.scrollingElement)
  ) {
    return { top: 0, bottom: window.innerHeight };
  }
  return container.getBoundingClientRect();
}

export function scrollContainerBy(container: HTMLElement, deltaY: number): boolean {
  if (
    typeof document !== "undefined" &&
    (container === document.documentElement ||
      container === document.body ||
      container === document.scrollingElement)
  ) {
    const prevY = window.scrollY;
    window.scrollBy(0, deltaY);
    return window.scrollY !== prevY;
  }
  const prevScrollTop = container.scrollTop;
  container.scrollTop += deltaY;
  return container.scrollTop !== prevScrollTop;
}

export type UseDragAutoScrollOptions = {
  getScrollContainer: () => HTMLElement | null;
  edgeThreshold?: number;
  maxSpeed?: number;
  onScrollFrame?: (point: { x: number; y: number }) => void;
};

export function useDragAutoScroll({
  getScrollContainer,
  edgeThreshold = 64,
  maxSpeed = 22,
  onScrollFrame
}: UseDragAutoScrollOptions) {
  const scrollSpeedRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const onScrollFrameRef = useRef(onScrollFrame);
  onScrollFrameRef.current = onScrollFrame;

  const stopAutoScroll = useCallback(() => {
    scrollSpeedRef.current = 0;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const updateAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      pointerPosRef.current = { x: clientX, y: clientY };
      const container = getScrollContainer();
      if (!container) {
        stopAutoScroll();
        return;
      }

      const rect = getContainerViewportRect(container);
      const speed = calculateAutoScrollSpeed(clientY, rect, edgeThreshold, maxSpeed);
      scrollSpeedRef.current = speed;

      if (speed !== 0 && animationFrameRef.current === null) {
        const step = () => {
          if (scrollSpeedRef.current !== 0) {
            const el = getScrollContainer();
            if (el) {
              const scrolled = scrollContainerBy(el, scrollSpeedRef.current);
              if (scrolled) {
                onScrollFrameRef.current?.(pointerPosRef.current);
              }
            }
            animationFrameRef.current = requestAnimationFrame(step);
          } else {
            animationFrameRef.current = null;
          }
        };
        animationFrameRef.current = requestAnimationFrame(step);
      }
    },
    [edgeThreshold, getScrollContainer, maxSpeed, stopAutoScroll]
  );

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return { updateAutoScroll, stopAutoScroll };
}
