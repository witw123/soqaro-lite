"use client";

import { useEffect } from "react";
import {
  appSettingsChangeEvent,
  customLayoutCanvas,
  getAppSettings,
  getCustomLayoutPageId
} from "@/features/settings/settings-store";

const layoutItemIds = ["sidebar", "content", "player", "mobile-navigation", "room-stage", "room-panel"] as const;

function getVisibilityDatasetKey(itemId: string) {
  return `customLayout${itemId.replace(/(^|-)([a-z])/g, (_match: string, _separator: string, letter: string) => letter.toUpperCase())}Visible` as keyof DOMStringMap;
}

/** Publishes the selected page layout without changing the mobile navigation contract. */
export function useCustomLayoutRuntime(pathname: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    const pageId = getCustomLayoutPageId(pathname);
    const isWorkspaceRoute = pathname === "/rooms" || pathname?.startsWith("/app") === true || pathname?.startsWith("/room/") === true;

    const clearLayoutVariables = () => {
      for (const itemId of layoutItemIds) {
        for (const property of ["x", "y", "width", "height"]) {
          root.style.removeProperty(`--custom-${itemId}-${property}`);
        }
      }
    };

    const syncLayout = () => {
      const settings = getAppSettings();
      const enabled = isWorkspaceRoute && settings.layout.customLayout.enabled;
      root.dataset.customLayoutEnabled = String(enabled);
      root.dataset.customLayoutPage = pageId;
      clearLayoutVariables();
      for (const itemId of layoutItemIds) {
        delete root.dataset[getVisibilityDatasetKey(itemId)];
      }

      if (!enabled) return;
      const page = settings.layout.customLayout.pages[pageId];
      for (const itemId of layoutItemIds) {
        const item = page[itemId];
        root.dataset[getVisibilityDatasetKey(itemId)] = String(item.visible);
        for (const property of ["x", "y", "width", "height"] as const) {
          const base = property === "x" || property === "width" ? customLayoutCanvas.width : customLayoutCanvas.height;
          root.style.setProperty(`--custom-${itemId}-${property}`, `${(item[property] / base) * 100}%`);
        }
      }
    };

    syncLayout();
    window.addEventListener(appSettingsChangeEvent, syncLayout);
    window.addEventListener("storage", syncLayout);
    return () => {
      window.removeEventListener(appSettingsChangeEvent, syncLayout);
      window.removeEventListener("storage", syncLayout);
      clearLayoutVariables();
      for (const itemId of layoutItemIds) delete root.dataset[getVisibilityDatasetKey(itemId)];
      root.dataset.customLayoutEnabled = "false";
      delete root.dataset.customLayoutPage;
    };
  }, [pathname]);
}
