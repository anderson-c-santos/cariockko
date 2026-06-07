import { describe, it, expect, vi } from "vitest";
import { startSseResponse } from "./sse.js";

function fakeRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    flushHeaders: vi.fn(),
    writableEnded: false,
    on: vi.fn(),
  };
  return res;
}

describe("sse.startSseResponse", () => {
  it("sets SSE headers and flushes them", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.flushHeaders).toHaveBeenCalled();
    client.close();
  });

  it("writes an initial padding comment", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    expect(res.write).toHaveBeenCalledWith(": open\n\n");
    client.close();
  });

  it("send() writes event and data frames", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    client.send("progress", { completed: 1 });
    expect(res.write).toHaveBeenCalledWith("event: progress\n");
    expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ completed: 1 })}\n\n`);
    client.close();
  });

  it("comment() writes a keep-alive frame", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    client.comment("ping");
    expect(res.write).toHaveBeenCalledWith(": ping\n\n");
    client.close();
  });

  it("close() ends the response if not already ended", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    client.close();
    expect(res.end).toHaveBeenCalled();
  });

  it("close() is a no-op when already ended", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    res.writableEnded = true;
    client.close();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("send() is a no-op after the response has ended", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    res.writableEnded = true;
    const writeCount = (res.write as ReturnType<typeof vi.fn>).mock.calls.length;
    client.send("done", { status: "completed" });
    expect((res.write as ReturnType<typeof vi.fn>).mock.calls.length).toBe(writeCount);
  });

  it("comment() is a no-op after the response has ended", () => {
    const res = fakeRes();
    const client = startSseResponse(res);
    res.writableEnded = true;
    const writeCount = (res.write as ReturnType<typeof vi.fn>).mock.calls.length;
    client.comment("ping");
    expect((res.write as ReturnType<typeof vi.fn>).mock.calls.length).toBe(writeCount);
  });

  it("stops the keep-alive timer when the response closes", () => {
    vi.useFakeTimers();
    try {
      const res = fakeRes();
      const client = startSseResponse(res, 100);
      // We registered a 'close' handler — invoking it should clear the interval
      // so subsequent ticks don't try to write.
      const closeHandler = (res.on as ReturnType<typeof vi.fn>).mock.calls
        .find((c: unknown[]) => c[0] === "close")?.[1];
      expect(typeof closeHandler).toBe("function");
      closeHandler();
      vi.advanceTimersByTime(500);
      // No additional writes beyond the initial ": open" comment.
      const initialWriteCount = (res.write as ReturnType<typeof vi.fn>).mock.calls.length;
      vi.advanceTimersByTime(500);
      expect((res.write as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialWriteCount);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
