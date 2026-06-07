const DEFAULT_KEEPALIVE_MS = 15_000;

export interface SseClient {
  send: (event: string, data: unknown) => void;
  comment: (text: string) => void;
  close: () => void;
}

export function startSseResponse(
  res: import("express").Response,
  keepAliveMs: number = DEFAULT_KEEPALIVE_MS
): SseClient {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (chunk: string) => {
    res.write(chunk);
  };

  const send = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    write(`event: ${event}\n`);
    write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const comment = (text: string) => {
    if (res.writableEnded) return;
    write(`: ${text}\n\n`);
  };

  // Send the initial padding so reverse-proxies flush headers immediately.
  comment("open");

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive);
      return;
    }
    comment("keep-alive");
  }, keepAliveMs);

  res.on("close", () => {
    clearInterval(keepAlive);
  });

  return {
    send,
    comment,
    close: () => {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        res.end();
      }
    },
  };
}
