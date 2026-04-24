export type Listener<T = unknown> = (payload: T) => void | Promise<void>;

export interface EventBus {
  on<T = unknown>(event: string, listener: Listener<T>): () => void;
  emit<T = unknown>(event: string, payload: T): Promise<void>;
  off<T = unknown>(event: string, listener: Listener<T>): void;
  listenerCount(event: string): number;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<Listener>>();

  const off: EventBus["off"] = (event, listener) => {
    listeners.get(event)?.delete(listener as Listener);
  };

  const on: EventBus["on"] = (event, listener) => {
    const lsn = listener as Listener;
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(lsn);
    return () => off(event, lsn);
  };

  const emit: EventBus["emit"] = async (event, payload) => {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    for (const lsn of [...set]) {
      await lsn(payload);
    }
  };

  const listenerCount: EventBus["listenerCount"] = (event) =>
    listeners.get(event)?.size ?? 0;

  return { on, emit, off, listenerCount };
}
