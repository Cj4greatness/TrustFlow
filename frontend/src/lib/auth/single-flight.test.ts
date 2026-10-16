import { describe, expect, it } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  it("runs one task for concurrent callers with the same key", async () => {
    const run = createSingleFlight<number>();
    let calls = 0;
    let release!: (value: number) => void;
    const task = () => {
      calls++;
      return new Promise<number>((resolve) => {
        release = resolve;
      });
    };

    const a = run("session-1", task);
    const b = run("session-1", task);
    release(7);

    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(calls).toBe(1);
  });

  it("runs separate tasks for different keys", async () => {
    const run = createSingleFlight<string>();
    const [a, b] = await Promise.all([
      run("one", async () => "a"),
      run("two", async () => "b"),
    ]);
    expect([a, b]).toEqual(["a", "b"]);
  });

  it("starts a fresh task after the previous one settles", async () => {
    const run = createSingleFlight<number>();
    let calls = 0;
    const task = async () => ++calls;

    expect(await run("k", task)).toBe(1);
    expect(await run("k", task)).toBe(2);
  });

  it("shares a failure with every waiter and does not retry on its own", async () => {
    const run = createSingleFlight<number>();
    let calls = 0;
    const failing = () => {
      calls++;
      return Promise.reject(new Error("session is dead"));
    };

    const results = await Promise.allSettled([
      run("k", failing),
      run("k", failing),
    ]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    await expect(run("k", async () => 5)).resolves.toBe(5);
  });

  it("turns a synchronous throw into a rejection", async () => {
    const run = createSingleFlight<number>();
    await expect(
      run("k", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
