export type HookHandler<C = unknown, R = unknown> = (ctx: C) => R | Promise<R>;

export interface HookRegistry {
  register<C = unknown, R = unknown>(
    name: string,
    handler: HookHandler<C, R>,
  ): () => void;
  invoke<C = unknown, R = unknown>(name: string, ctx: C): Promise<R[]>;
  count(name: string): number;
}

export function createHookRegistry(): HookRegistry {
  const hooks = new Map<string, Set<HookHandler>>();

  const unregister = (name: string, handler: HookHandler): void => {
    hooks.get(name)?.delete(handler);
  };

  const register: HookRegistry["register"] = (name, handler) => {
    const h = handler as HookHandler;
    let set = hooks.get(name);
    if (!set) {
      set = new Set();
      hooks.set(name, set);
    }
    set.add(h);
    return () => unregister(name, h);
  };

  const invoke: HookRegistry["invoke"] = async <C, R>(
    name: string,
    ctx: C,
  ): Promise<R[]> => {
    const set = hooks.get(name);
    if (!set) return [];
    const results: R[] = [];
    for (const h of [...set]) {
      results.push((await h(ctx)) as R);
    }
    return results;
  };

  const count: HookRegistry["count"] = (name) =>
    hooks.get(name)?.size ?? 0;

  return { register, invoke, count };
}
