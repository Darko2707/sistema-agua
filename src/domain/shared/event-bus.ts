import type { DomainEvent } from './domain-event';

type EventHandler = (event: DomainEvent) => Promise<void> | void;

class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  /** Register a handler for a specific event class name. */
  subscribe(eventName: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventName) ?? [];
    this.handlers.set(eventName, [...existing, handler]);
  }

  /** Dispatch all events in order, awaiting each handler. */
  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const eventName = event.constructor.name;
      const listeners = this.handlers.get(eventName) ?? [];
      await Promise.all(listeners.map((h) => h(event)));
    }
  }
}

// Singleton — shared across the process lifetime (safe for serverless: one process per invocation).
export const eventBus = new EventBus();
