import type { DomainEventLite } from "@gss/contracts";

type Handler = (event: DomainEventLite) => void;

export class EventBus {
  private handlers: Handler[] = [];
  private log: DomainEventLite[] = [];

  subscribe(handler: Handler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  publish(event: DomainEventLite): void {
    this.log.push(event);
    for (const h of this.handlers) {
      h(event);
    }
  }

  publishAll(events: DomainEventLite[]): void {
    for (const e of events) this.publish(e);
  }

  getLog(): DomainEventLite[] {
    return [...this.log];
  }

  loadLog(events: DomainEventLite[]): void {
    this.log = [...events];
  }
}
