import type { JobSnapshot } from "./api";

export interface JobEventHandlers {
  onProgress?: (snapshot: JobSnapshot) => void;
  onDone?: (status: "completed" | "failed" | "cancelled") => void;
  onError?: (error: Event) => void;
}

export interface JobEventSubscription {
  close: () => void;
}

/**
 * Subscribes to the SSE stream for a generation job. The browser-side
 * `EventSource` handles keep-alives automatically. We translate raw events
 * into typed callbacks so the UI doesn't deal with parsing.
 */
export function subscribeJobEvents(
  jobId: string,
  handlers: JobEventHandlers
): JobEventSubscription {
  const es = new EventSource(`/api/content-producer/jobs/${jobId}/events`);

  if (handlers.onProgress) {
    es.addEventListener("progress", (e) => {
      try {
        const snap = JSON.parse((e as MessageEvent).data) as JobSnapshot;
        handlers.onProgress?.(snap);
      } catch {
        // Ignore malformed events.
      }
    });
  }

  if (handlers.onDone) {
    es.addEventListener("done", (e) => {
      try {
        const { status } = JSON.parse((e as MessageEvent).data) as {
          status: "completed" | "failed" | "cancelled";
        };
        handlers.onDone?.(status);
      } catch {
        handlers.onDone?.("failed");
      }
    });
  }

  if (handlers.onError) {
    es.addEventListener("error", (e) => handlers.onError?.(e));
  }

  return {
    close: () => es.close(),
  };
}
