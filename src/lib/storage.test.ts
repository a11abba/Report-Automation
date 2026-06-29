import { afterEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("getStore", () => {
  it("waits for the Postgres schema before returning the store", async () => {
    process.env.DATABASE_URL = "postgresql://example.test/app";

    let finishInitialization!: () => void;
    const initialization = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });
    const waitUntilReady = vi.fn(() => initialization);
    const store = { waitUntilReady };
    const PostgresStore = vi.fn(function MockPostgresStore() {
      return store;
    });

    vi.doMock("@/lib/postgres-store", () => ({ PostgresStore }));

    const { getStore } = await import("./storage");
    let resolved = false;
    const storePromise = getStore().then((value) => {
      resolved = true;
      return value;
    });

    await vi.waitFor(() => expect(waitUntilReady).toHaveBeenCalledOnce());
    expect(resolved).toBe(false);

    finishInitialization();

    await expect(storePromise).resolves.toBe(store);
    expect(PostgresStore).toHaveBeenCalledWith(process.env.DATABASE_URL);
  });
});
