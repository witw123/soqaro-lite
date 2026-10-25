const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function normalizeConfiguredBaseUrl(rawUrl: string) {
  return rawUrl.trim().replace(/\/$/, "");
}

function isLocalHostname(hostname: string) {
  return localHostnames.has(hostname.trim().toLowerCase());
}

function shouldPreferCurrentOrigin(configuredBaseUrl: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const configured = new URL(configuredBaseUrl, window.location.origin);
    const current = new URL(window.location.origin);
    if (isLocalHostname(configured.hostname) || isLocalHostname(current.hostname)) {
      return false;
    }

    return configured.origin !== current.origin;
  } catch {
    return true;
  }
}

function getDefaultApiBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3001";
}

function resolveApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return getDefaultApiBaseUrl();
  }

  const normalizedConfiguredBaseUrl = normalizeConfiguredBaseUrl(configuredBaseUrl);
  if (shouldPreferCurrentOrigin(normalizedConfiguredBaseUrl)) {
    return window.location.origin;
  }

  return normalizedConfiguredBaseUrl;
}

export const apiBaseUrl = resolveApiBaseUrl();
