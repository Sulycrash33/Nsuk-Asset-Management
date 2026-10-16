const APP_ORIGIN = "https://nsuk.invalid";

/** Keep post-sign-in navigation on this app, including browser URL normalization. */
export function safeAppPath(value: string | null, fallback = "/dashboard"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, APP_ORIGIN);
    return url.origin === APP_ORIGIN ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}

export function expiredCallbackPath(destination: string): string {
  const url = new URL(safeAppPath(destination), APP_ORIGIN);
  url.searchParams.set("link", "expired");
  url.hash = "";
  return url.pathname + url.search;
}

type EmailSessionOperations = {
  clearFragment: () => void;
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ error: unknown }>;
};

/** Invitations deliver fragments; PKCE recovery codes are exchanged on the server. */
export async function completeEmailSession(fragment: string, operations: EmailSessionOperations): Promise<boolean> {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  // Remove credentials from the address bar before any asynchronous work.
  operations.clearFragment();
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (params.has("error") || params.has("error_code") || !access_token || !refresh_token) return false;
  try {
    const { error } = await operations.setSession({ access_token, refresh_token });
    return !error;
  } catch { return false; }
}

