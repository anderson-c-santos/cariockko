import { describe, it, expect, beforeEach, vi } from "vitest";

describe("getOrCreateSessionId", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          Object.keys(store).forEach((k) => delete store[k]);
        },
      },
    });
  });

  it("creates and reuses a session id", async () => {
    const { getOrCreateSessionId } = await import("./session");
    const a = getOrCreateSessionId();
    const b = getOrCreateSessionId();
    expect(a).toBe(b);
    expect(a).toMatch(/^web-/);
  });
});

describe("subscribeJobEvents", () => {
  it("registers progress and done handlers and closes cleanly", async () => {
    const listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
    const fakeEs = {
      addEventListener: vi.fn((event: string, cb: (e: MessageEvent) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
      }),
      close: vi.fn(),
    };
    class FakeEventSource {
      addEventListener = fakeEs.addEventListener;
      close = fakeEs.close;
    }
    // @ts-expect-error override for test
    globalThis.EventSource = FakeEventSource;

    const { subscribeJobEvents } = await import("./sse");
    const onProgress = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const sub = subscribeJobEvents("job-1", { onProgress, onDone, onError });

    expect(fakeEs.addEventListener).toHaveBeenCalled();
    expect(listeners.progress).toBeDefined();
    expect(listeners.done).toBeDefined();
    expect(listeners.error).toBeDefined();

    // Simulate a progress event.
    listeners.progress[0]({ data: JSON.stringify({ id: "job-1", status: "running" }) } as MessageEvent);
    expect(onProgress).toHaveBeenCalled();

    // Simulate a done event.
    listeners.done[0]({ data: JSON.stringify({ status: "completed" }) } as MessageEvent);
    expect(onDone).toHaveBeenCalledWith("completed");

    // Simulate an error event.
    listeners.error[0](new MessageEvent("error"));
    expect(onError).toHaveBeenCalled();

    sub.close();
    expect(fakeEs.close).toHaveBeenCalled();
  });
});
