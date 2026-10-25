import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

describe("retained page query lifecycle", () => {
  it("shares profile requests and defers hidden-page invalidations until return", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const queryFn = vi.fn().mockResolvedValue({ plays: 1 });
    const options = { queryKey: ["personalization", "user", "profile"], queryFn };
    const overview = new QueryObserver(client, options);
    const details = new QueryObserver(client, options);
    const stopOverview = overview.subscribe(() => {});
    const stopDetails = details.subscribe(() => {});
    try {
      await client.fetchQuery(options);
      expect(queryFn).toHaveBeenCalledTimes(1);
      overview.setOptions({ ...options, enabled: false });
      details.setOptions({ ...options, enabled: false });
      await client.invalidateQueries({ queryKey: ["personalization"], refetchType: "none" });
      await client.refetchQueries({ queryKey: ["personalization"], type: "active" });
      expect(queryFn).toHaveBeenCalledTimes(1);
      details.setOptions({ ...options, enabled: true });
      await client.fetchQuery(options);
      expect(queryFn).toHaveBeenCalledTimes(2);
    } finally {
      stopOverview();
      stopDetails();
      client.clear();
    }
  });

  it("cancels hidden requests while retaining the last directory", async () => {
    const client = new QueryClient();
    const queryKey = ["rooms", "user"];
    client.setQueryData(queryKey, ["existing-room"]);
    let requestSignal: AbortSignal | undefined;
    const options = {
      queryKey,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        requestSignal = signal;
        return new Promise<string[]>(() => {});
      }
    };
    const observer = new QueryObserver(client, options);
    const stop = observer.subscribe(() => {});
    try {
      observer.setOptions({ ...options, enabled: false });
      await client.cancelQueries({ queryKey, type: "inactive" });
      expect(requestSignal?.aborted).toBe(true);
      expect(client.getQueryData(queryKey)).toEqual(["existing-room"]);
    } finally {
      stop();
      client.clear();
    }
  });
});
