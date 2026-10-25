"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { personalizationChangedEvent } from "@/features/personalization/use-personalization-reporter";

export function WorkspaceQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 15 * 60_000,
        retry: false,
        refetchOnWindowFocus: false
      }
    }
  }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPersonalizationChanged = () => {
      void client.invalidateQueries({ queryKey: ["personalization"], refetchType: "none" });
      void client.invalidateQueries({ queryKey: ["discover"], refetchType: "none" });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        // Hidden-page observers stay stale until they become active.
        void client.refetchQueries({ queryKey: ["personalization"], type: "active" });
        void client.refetchQueries({ queryKey: ["discover"], type: "active" });
      }, 450);
    };
    window.addEventListener(personalizationChangedEvent, onPersonalizationChanged);
    return () => {
      window.removeEventListener(personalizationChangedEvent, onPersonalizationChanged);
      if (timer) clearTimeout(timer);
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
