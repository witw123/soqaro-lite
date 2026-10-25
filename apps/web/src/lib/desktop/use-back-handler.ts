"use client";

import { useEffect, useRef } from "react";
import { pushBackHandler } from "./back-handler";

/**
 * Makes the Android hardware back button dismiss this surface while `enabled`.
 *
 * Register wherever Escape already closes the overlay, so both keys stay in
 * sync — including the conditions under which Escape is deliberately ignored
 * (a confirm dialog mid-request, for example), which reach this hook through
 * `enabled`.
 */
export function useBackHandler(handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return pushBackHandler(() => handlerRef.current());
  }, [enabled]);
}
