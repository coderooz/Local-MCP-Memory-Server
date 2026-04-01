export function createEventBus() {
  const listeners = new Map();

  return {
    on(eventName, handler) {
      const existing = listeners.get(eventName) || [];
      existing.push(handler);
      listeners.set(eventName, existing);
    },

    async emit(eventName, payload) {
      const handlers = listeners.get(eventName) || [];

      for (const handler of handlers) {
        await handler(payload);
      }
    }
  };
}
