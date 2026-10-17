import { describe, expect, it } from "vitest";
import { createCrossTabLock, type LockManagerLike } from "./cross-tab-lock";

function fakeLocks(): LockManagerLike {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request(_name, callback) {
      const run = tail.then(() => callback());
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function recordedTask(events: string[], label: string) {
  return async () => {
    events.push(`start ${label}`);
    await pause(10);
    events.push(`end ${label}`);
    return label;
  };
}

describe("createCrossTabLock", () => {
  it("runs tasks one at a time when a lock manager is available", async () => {
    const run = createCrossTabLock(fakeLocks());
    const events: string[] = [];

    const results = await Promise.all([
      run("refresh", recordedTask(events, "a")),
      run("refresh", recordedTask(events, "b")),
    ]);

    expect(results).toEqual(["a", "b"]);
    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("runs the task directly when there is no lock manager", async () => {
    const run = createCrossTabLock(null);
    const events: string[] = [];

    await Promise.all([
      run("refresh", recordedTask(events, "a")),
      run("refresh", recordedTask(events, "b")),
    ]);

    expect(events.slice(0, 2)).toEqual(["start a", "start b"]);
  });

  it("returns the task's value", async () => {
    expect(await createCrossTabLock(null)("x", async () => 42)).toBe(42);
    expect(await createCrossTabLock(fakeLocks())("x", async () => 7)).toBe(7);
  });

  it("does not block later tasks after a failure", async () => {
    const run = createCrossTabLock(fakeLocks());

    await expect(
      run("refresh", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(run("refresh", async () => "next")).resolves.toBe("next");
  });
});
