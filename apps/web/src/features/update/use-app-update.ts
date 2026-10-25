"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkForUpdates,
  type UpdateCheckResult
} from "./update-checker";

export type UpdateCheckStatus = "idle" | "checking" | "latest" | "available" | "error";

const SESSION_CHECKED_KEY = "soqaro-update-checked-session";

export function useAppUpdate(options?: { autoCheck?: boolean }) {
  const [status, setStatus] = useState<UpdateCheckStatus>("idle");
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const check = useCallback(async (manual = false) => {
    setStatus("checking");
    setErrorMessage(null);

    try {
      const res = await checkForUpdates();
      setResult(res);

      if (res.hasUpdate) {
        setStatus("available");
        if (!manual) {
          setIsPromptOpen(true);
        }
      } else {
        setStatus("latest");
      }
      return res;
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "检查更新失败";
      setErrorMessage(message);
      return null;
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    setIsPromptOpen(false);
  }, []);

  useEffect(() => {
    if (!options?.autoCheck) return;
    if (typeof window === "undefined") return;

    // Check if already checked during this browser/app session
    try {
      if (sessionStorage.getItem(SESSION_CHECKED_KEY)) {
        return;
      }
    } catch {
      // Ignore sessionStorage access errors
    }

    // Delay slightly to let initial app mount & audio hydration settle first
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_CHECKED_KEY, "true");
      } catch {
        // Ignore
      }
      void check(false);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [check, options?.autoCheck]);

  return {
    status,
    result,
    errorMessage,
    isPromptOpen,
    check,
    dismissPrompt
  };
}
