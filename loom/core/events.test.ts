import { describe, it, expect } from "vitest";
import { createEventBus } from "./events";

describe("EventBus", () => {
  it("delivers payload to subscribed listener", async () => {
    const bus = createEventBus();
    const received: number[] = [];
    bus.on<number>("test", (n) => {
      received.push(n);
    });
    await bus.emit<number>("test", 42);
    expect(received).toEqual([42]);
  });

  it("supports multiple listeners on the same event", async () => {
    const bus = createEventBus();
    let a = 0;
    let b = 0;
    bus.on<number>("t", (n) => {
      a += n;
    });
    bus.on<number>("t", (n) => {
      b += n * 2;
    });
    await bus.emit<number>("t", 3);
    expect(a).toBe(3);
    expect(b).toBe(6);
  });

  it("unsubscribes via returned callback", async () => {
    const bus = createEventBus();
    let calls = 0;
    const off = bus.on("t", () => {
      calls++;
    });
    await bus.emit("t", undefined);
    off();
    await bus.emit("t", undefined);
    expect(calls).toBe(1);
  });

  it("awaits async listeners before resolving emit", async () => {
    const bus = createEventBus();
    let done = false;
    bus.on("t", async () => {
      await new Promise((r) => setTimeout(r, 10));
      done = true;
    });
    await bus.emit("t", undefined);
    expect(done).toBe(true);
  });

  it("is a no-op when the event has no listeners", async () => {
    const bus = createEventBus();
    await expect(bus.emit("never", 1)).resolves.toBeUndefined();
  });

  it("reports listener counts", () => {
    const bus = createEventBus();
    expect(bus.listenerCount("a")).toBe(0);
    bus.on("a", () => {});
    bus.on("a", () => {});
    expect(bus.listenerCount("a")).toBe(2);
  });
});
