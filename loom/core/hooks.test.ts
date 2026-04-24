import { describe, it, expect } from "vitest";
import { createHookRegistry } from "./hooks";

describe("HookRegistry", () => {
  it("invokes handlers and collects results in registration order", async () => {
    const hooks = createHookRegistry();
    hooks.register<number, number>("double", (n) => n * 2);
    hooks.register<number, number>("double", (n) => n * 3);
    const results = await hooks.invoke<number, number>("double", 5);
    expect(results).toEqual([10, 15]);
  });

  it("returns an empty array when no handlers are registered", async () => {
    const hooks = createHookRegistry();
    expect(await hooks.invoke("none", {})).toEqual([]);
  });

  it("awaits async handlers", async () => {
    const hooks = createHookRegistry();
    hooks.register<string, string>("t", async (s) => s.toUpperCase());
    const [r] = await hooks.invoke<string, string>("t", "hi");
    expect(r).toBe("HI");
  });

  it("unregisters via returned callback", async () => {
    const hooks = createHookRegistry();
    const off = hooks.register<void, number>("t", () => 1);
    hooks.register<void, number>("t", () => 2);
    off();
    expect(await hooks.invoke<void, number>("t", undefined)).toEqual([2]);
  });

  it("counts registered handlers", () => {
    const hooks = createHookRegistry();
    expect(hooks.count("x")).toBe(0);
    hooks.register("x", () => {});
    hooks.register("x", () => {});
    expect(hooks.count("x")).toBe(2);
  });
});
