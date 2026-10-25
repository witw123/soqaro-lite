import { describe, expect, it, vi } from "vitest";
import {
  calculateAutoScrollSpeed,
  findScrollableContainer,
  findScrollableParent,
  getContainerViewportRect,
  scrollContainerBy
} from "./use-drag-auto-scroll";

describe("calculateAutoScrollSpeed", () => {
  const containerRect = { top: 100, bottom: 500 }; // height = 400, threshold = 64

  it("returns 0 when cursor is in the middle of the container", () => {
    expect(calculateAutoScrollSpeed(300, containerRect)).toBe(0);
  });

  it("calculates negative speed when cursor is near top edge (scroll up)", () => {
    // top = 100, edgeThreshold = 64 -> top edge is [100, 164]
    const speedNearEdge = calculateAutoScrollSpeed(150, containerRect, 64, 22);
    expect(speedNearEdge).toBeLessThan(0);

    const speedAtTop = calculateAutoScrollSpeed(100, containerRect, 64, 22);
    expect(speedAtTop).toBe(-22);

    // Slightly above top (within +30 tolerance)
    const speedAboveTop = calculateAutoScrollSpeed(80, containerRect, 64, 22);
    expect(speedAboveTop).toBe(-22);
  });

  it("calculates positive speed when cursor is near bottom edge (scroll down)", () => {
    // bottom = 500, edgeThreshold = 64 -> bottom edge is [436, 500]
    const speedNearEdge = calculateAutoScrollSpeed(450, containerRect, 64, 22);
    expect(speedNearEdge).toBeGreaterThan(0);

    const speedAtBottom = calculateAutoScrollSpeed(500, containerRect, 64, 22);
    expect(speedAtBottom).toBe(22);

    // Slightly below bottom (within +30 tolerance)
    const speedBelowBottom = calculateAutoScrollSpeed(520, containerRect, 64, 22);
    expect(speedBelowBottom).toBe(22);
  });

  it("stops scrolling when cursor moves beyond tolerance outside container", () => {
    // Way above top (more than 30px)
    expect(calculateAutoScrollSpeed(60, containerRect)).toBe(0);
    // Way below bottom (more than 30px)
    expect(calculateAutoScrollSpeed(540, containerRect)).toBe(0);
  });

  it("adjusts threshold dynamically for small containers to prevent deadzone collapse", () => {
    const smallRect = { top: 50, bottom: 140 }; // height = 90 -> threshold = 30
    // Middle is (50+30, 140-30) = (80, 110)
    expect(calculateAutoScrollSpeed(95, smallRect, 64)).toBe(0);
    // Near top edge [50, 80]
    expect(calculateAutoScrollSpeed(60, smallRect, 64)).toBeLessThan(0);
    // Near bottom edge [110, 140]
    expect(calculateAutoScrollSpeed(130, smallRect, 64)).toBeGreaterThan(0);
  });
});

describe("findScrollableContainer & findScrollableParent", () => {
  it("returns null when window is not defined", () => {
    expect(findScrollableContainer(null)).toBe(null);
  });

  it("finds the scrollable ancestor or element itself when mocked window is present", () => {
    const originalWindow = globalThis.window;
    const computedStyles = new Map<HTMLElement, { overflowY: string }>();
    const globals = globalThis as unknown as {
      window?: unknown;
      document?: unknown;
    };

    globals.window = {
      getComputedStyle: (el: HTMLElement) => computedStyles.get(el) ?? { overflowY: "visible" },
      innerHeight: 800,
      scrollBy: vi.fn(),
      scrollY: 0
    };
    const mockScrollingElement = { isScrollingElement: true } as unknown as HTMLElement;
    globals.document = {
      scrollingElement: mockScrollingElement
    };

    try {
      const child = { parentElement: null } as unknown as HTMLElement & { parentElement: HTMLElement | null };
      const scrollParent = { parentElement: null } as unknown as HTMLElement & { parentElement: HTMLElement | null };
      child.parentElement = scrollParent;
      computedStyles.set(scrollParent, { overflowY: "auto" });

      expect(findScrollableContainer(child)).toBe(scrollParent);
      expect(findScrollableParent(child)).toBe(scrollParent);

      // Element itself scrollable
      expect(findScrollableContainer(scrollParent)).toBe(scrollParent);

      // No scrollable parent falls back to document.scrollingElement
      const orphan = { parentElement: null } as unknown as HTMLElement;
      expect(findScrollableContainer(orphan)).toBe(mockScrollingElement);
    } finally {
      globals.window = originalWindow;
      delete globals.document;
    }
  });
});

describe("getContainerViewportRect and scrollContainerBy", () => {
  it("scrolls non-document container by mutating scrollTop", () => {
    const container = {
      scrollTop: 10,
      getBoundingClientRect: () => ({ top: 50, bottom: 200 } as DOMRect)
    } as unknown as HTMLElement;
    const rect = getContainerViewportRect(container);
    expect(rect).toEqual({ top: 50, bottom: 200 });

    const scrolled = scrollContainerBy(container, 15);
    expect(container.scrollTop).toBe(25);
    expect(scrolled).toBe(true);
  });

  it("uses window viewport and scrollBy when container is documentElement / scrollingElement", () => {
    const scrollByMock = vi.fn();
    const docElem = { isDoc: true } as unknown as HTMLElement;
    const globals = globalThis as unknown as {
      window?: unknown;
      document?: unknown;
    };
    globals.window = {
      innerHeight: 768,
      scrollBy: scrollByMock,
      scrollY: 100
    };
    globals.document = {
      documentElement: docElem
    };

    try {
      const rect = getContainerViewportRect(docElem);
      expect(rect).toEqual({ top: 0, bottom: 768 });

      scrollContainerBy(docElem, 20);
      expect(scrollByMock).toHaveBeenCalledWith(0, 20);
    } finally {
      delete globals.window;
      delete globals.document;
    }
  });
});
