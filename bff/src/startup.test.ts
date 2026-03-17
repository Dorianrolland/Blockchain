import { describe, expect, it, vi } from "vitest";

import { formatStartupError, startIndexerInBackground } from "./startup.js";

describe("startup helpers", () => {
  it("formats Error instances for structured logs", () => {
    const error = new Error("rpc timeout");

    expect(formatStartupError(error)).toMatchObject({
      name: "Error",
      message: "rpc timeout",
    });
  });

  it("retries indexer startup in the background until it succeeds", async () => {
    const indexer = {
      start: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce(undefined),
    };
    const logger = {
      warn: vi.fn(),
    };

    await startIndexerInBackground(indexer, {
      logger: logger as never,
      initialDelayMs: 1,
      maxDelayMs: 2,
    });

    expect(indexer.start).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        delayMs: 1,
      }),
      "Indexer startup failed. Retrying in background.",
    );
  });

  it("stops retrying once the startup signal is aborted", async () => {
    const controller = new AbortController();
    const indexer = {
      start: vi.fn<() => Promise<void>>().mockRejectedValue(new Error("timeout")),
    };
    const logger = {
      warn: vi.fn(() => {
        controller.abort();
      }),
    };

    await startIndexerInBackground(indexer, {
      logger: logger as never,
      signal: controller.signal,
      initialDelayMs: 10,
      maxDelayMs: 10,
    });

    expect(indexer.start).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
