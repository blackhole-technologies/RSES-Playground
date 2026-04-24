import { describe, it, expect } from "vitest";
import {
  runInUserScope,
  getCurrentUserScope,
  assertUserScope,
} from "./context";

describe("tenant-scope context", () => {
  it("getCurrentUserScope returns undefined outside a scope", () => {
    expect(getCurrentUserScope()).toBeUndefined();
  });

  it("runInUserScope binds the userId inside the callback", async () => {
    const result = await runInUserScope("user-1", async () => {
      return getCurrentUserScope()?.userId;
    });
    expect(result).toBe("user-1");
  });

  it("scope clears after the callback returns", async () => {
    await runInUserScope("user-1", async () => "done");
    expect(getCurrentUserScope()).toBeUndefined();
  });

  it("scope propagates through awaits", async () => {
    const result = await runInUserScope("user-1", async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 5));
      return getCurrentUserScope()?.userId;
    });
    expect(result).toBe("user-1");
  });

  it("nested scopes use the inner userId", async () => {
    const result = await runInUserScope("outer", async () =>
      runInUserScope("inner", async () => getCurrentUserScope()?.userId),
    );
    expect(result).toBe("inner");
  });

  it("concurrent scopes stay isolated per async chain", async () => {
    const a = runInUserScope("user-a", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return getCurrentUserScope()?.userId;
    });
    const b = runInUserScope("user-b", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getCurrentUserScope()?.userId;
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("user-a");
    expect(rb).toBe("user-b");
  });

  it("assertUserScope returns the bound userId when scoped", async () => {
    const id = await runInUserScope("user-x", async () =>
      assertUserScope("test"),
    );
    expect(id).toBe("user-x");
  });

  it("assertUserScope throws outside a scope with the caller label", () => {
    expect(() => assertUserScope("someCaller")).toThrow(/someCaller/);
    expect(() => assertUserScope("someCaller")).toThrow(
      /requires a user scope/,
    );
  });
});
