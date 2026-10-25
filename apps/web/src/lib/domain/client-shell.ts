export function buildAppEntryHref() {
  return "/app";
}

export function buildWorkspaceAuthHref(options?: {
  redirectTo?: string;
}) {
  const redirectTo = options?.redirectTo ?? "/app";
  const nextSearchParams = new URLSearchParams({
    redirectTo
  });

  return `/auth?${nextSearchParams.toString()}`;
}
