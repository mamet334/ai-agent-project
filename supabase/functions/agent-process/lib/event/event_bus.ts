export type EventType = 
  | 'System.Started'
  | 'Intent.Received'
  | 'Task.Created'
  | 'Capability.Executed'
  | 'Verification.Started'
  | 'Verification.Completed'
  | 'Verification.Failed'
  | 'Evidence.Evaluated'
  | 'Memory.WriteRequested'
  | 'Response.Generated'
  | 'Tool.Invoked'
  | 'Tool.Requested'
  | 'Tool.Completed'
  | 'Error.Occurred';

export interface MAEFEvent {
  id: string;
  type: EventType;
  timestamp: number;
  source: string;
  payload: any;
  trace_id?: string;
  context?: any;
}

type EventHandler = (event: MAEFEvent) => Promise<void> | void;

class EventBus {
  private readonly MAX_EVENTS = 1000;
  private subscribers = new Map<EventType, EventHandler[]>();
  private eventStore: MAEFEvent[] = [];

  public emit(event: Omit<MAEFEvent, 'id' | 'timestamp'>) {
    const fullEvent: MAEFEvent = {
      ...event,
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
      timestamp: Date.now()
    };

    console.log(`[EVENT_BUS] ${fullEvent.type} from ${fullEvent.source} | trace_id: ${fullEvent.trace_id || 'none'}`);
    this.eventStore.push(fullEvent);
    
    if (this.eventStore.length > this.MAX_EVENTS) {
      this.eventStore.shift();
    }

    const handlers = this.subscribers.get(fullEvent.type) || [];
    for (const handler of handlers) {
      try {
        const result = handler(fullEvent);
        if (result instanceof Promise) {
          result.catch(err => console.error(`[EVENT_BUS] Async handler error for ${fullEvent.type}:`, err));
        }
      } catch (err) {
        console.error(`[EVENT_BUS] Sync handler error for ${fullEvent.type}:`, err);
      }
    }
  }

  public subscribe(type: EventType, handler: EventHandler) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, []);
    }
    this.subscribers.get(type)!.push(handler);
  }

  public getHistory(): MAEFEvent[] {
    return [...this.eventStore];
  }
}

export const eventBus = new EventBus();
