import {
  iceServerConfigSchema,
  type IceConfigResponse,
  type IceServerConfig
} from "@soqaro/shared";

export * from "./mesh";
export * from "./diagnostics";
export * from "./transport-health";
export * from "./connection-supervisor";
export * from "./peer-link-profile";
export * from "./use-peer-diagnostics";
export * from "./peer-telemetry";

export function getWebRTCIceServers(config?: IceConfigResponse | null): IceServerConfig[] {
  if (config?.iceServers?.length) {
    return normalizeIceServers(config.iceServers);
  }

  return getStaticWebRTCIceServers();
}

export function getStaticWebRTCIceServers(): IceServerConfig[] {
  const rawJson = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const result = iceServerConfigSchema.array().safeParse(parsed);
      if (result.success && result.data.length > 0) {
        return normalizeIceServers(result.data);
      }
    } catch {
      // Use the individual environment variables below when JSON is invalid.
    }
  }

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL?.trim();
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();
  const configuredStunUrl = process.env.NEXT_PUBLIC_STUN_URL?.trim();

  const defaultStuns = [
    "stun:stun.qq.com:3478",
    "stun:stun.miwifi.com:3478",
    "stun:stun.chat.bilibili.com:3478",
    "stun:stun.cloudflare.com:3478"
  ];
  const stunUrls = configuredStunUrl ? [configuredStunUrl, ...defaultStuns] : defaultStuns;
  const servers: IceServerConfig[] = stunUrls.map((url) => ({ urls: url }));
  if (turnUrl && isTurnUrl(turnUrl)) {
    servers.push({
      urls: turnUrl,
      username: turnUsername || undefined,
      credential: turnCredential || undefined
    });
  }

  return servers;
}

export function parseIceConfigResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const iceServersResult = iceServerConfigSchema.array().safeParse(candidate.iceServers);
  const ttlSeconds = candidate.ttlSeconds;
  const source = candidate.source;

  if (
    !iceServersResult.success ||
    typeof ttlSeconds !== "number" ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0 ||
    (source !== "ephemeral" && source !== "static" && source !== "stun-only")
  ) {
    return null;
  }

  return {
    iceServers: normalizeIceServers(iceServersResult.data),
    ttlSeconds,
    source
  } satisfies IceConfigResponse;
}

function normalizeIceServers(servers: IceServerConfig[]) {
  return servers.flatMap((server) => {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls])
      .filter((url) => url.trim().length > 0);
    return urls.length > 0
      ? [{ ...server, urls: urls.length === 1 ? urls[0] : urls }]
      : [];
  });
}

function isTurnUrl(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("turn:") || normalized.startsWith("turns:");
}

export async function testTurnConnectivity(
  iceServers: IceServerConfig[],
  timeoutMs = 8_000
) {
  const startedAt = performance.now();
  const turnServers = normalizeIceServers(iceServers).filter((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });

  if (turnServers.length === 0) {
    return {
      reachable: false,
      relayCandidates: 0,
      udpRelayCandidates: 0,
      srflxCandidates: 0,
      hostCandidates: 0,
      totalCandidates: 0,
      gatherDurationMs: 0,
      error: "no-turn-servers-configured"
    };
  }

  const pc = new RTCPeerConnection({
    iceServers: turnServers,
    iceTransportPolicy: "relay"
  });
  const relayCandidates: RTCIceCandidate[] = [];
  const udpRelayCandidates: RTCIceCandidate[] = [];
  const srflxCandidates: RTCIceCandidate[] = [];
  const hostCandidates: RTCIceCandidate[] = [];
  let gatherError: string | undefined;

  try {
    const gatherPromise = new Promise<void>((resolve) => {
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") resolve();
      };
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        if (event.candidate.type === "relay") {
          relayCandidates.push(event.candidate);
          if (event.candidate.protocol?.toLowerCase() === "udp") {
            udpRelayCandidates.push(event.candidate);
          }
        } else if (event.candidate.type === "srflx") {
          srflxCandidates.push(event.candidate);
        } else if (event.candidate.type === "host") {
          hostCandidates.push(event.candidate);
        }
      };
    });

    pc.createDataChannel("turn-test");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await Promise.race([
      gatherPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  } catch (error) {
    gatherError = error instanceof Error ? error.message : String(error);
  }

  const gatherDurationMs = performance.now() - startedAt;
  pc.close();
  return {
    reachable: relayCandidates.length > 0,
    relayCandidates: relayCandidates.length,
    udpRelayCandidates: udpRelayCandidates.length,
    srflxCandidates: srflxCandidates.length,
    hostCandidates: hostCandidates.length,
    totalCandidates: relayCandidates.length + srflxCandidates.length + hostCandidates.length,
    gatherDurationMs: Math.round(gatherDurationMs),
    error: gatherError
  };
}
