const SESSION_KEY = "cariockko_session";

/**
 * Returns a stable per-browser session ID, creating one on first call.
 * The Content Producer chat history and generation jobs both scope to
 * this ID so they can be restored after navigation/reload.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    return "server-side";
  }
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function clearSessionId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}
