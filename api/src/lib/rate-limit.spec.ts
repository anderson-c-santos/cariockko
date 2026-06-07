import { describe, it, expect, vi } from "vitest";
import { rateLimit } from "./rate-limit.js";

function makeReq(body: unknown = {}): any {
  return { body };
}
function makeRes() {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe("rateLimit", () => {
  it("passes through when no key can be derived", () => {
    const limiter = rateLimit({ key: () => null, max: 1, windowMs: 1000 });
    const next = vi.fn();
    limiter(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects with 429 when the bucket is empty", () => {
    const limiter = rateLimit({
      key: (req) => `s-${req.body?.id ?? ""}`,
      max: 1,
      windowMs: 1000,
    });
    const res = makeRes();
    const next = vi.fn();
    limiter(makeReq({ id: "1" }), res, next);
    limiter(makeReq({ id: "1" }), res, next); // second hit
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });

  it("refills the bucket over time", async () => {
    const limiter = rateLimit({
      key: (req) => `s-${req.body?.id ?? ""}`,
      max: 1,
      windowMs: 30,
    });
    const res = makeRes();
    const next = vi.fn();
    limiter(makeReq({ id: "2" }), res, next);
    limiter(makeReq({ id: "2" }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 50));
    limiter(makeReq({ id: "2" }), res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
