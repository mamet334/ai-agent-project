import { eventBus, MAEFEvent } from '../event_bus.ts';
import { processMemoryWriteQueue } from '../../../memory_write_worker.ts';

export const registerMemorySubscribers = () => {
  eventBus.subscribe('Memory.WriteRequested', (event: MAEFEvent) => {
    const { rctx, userId, message, canWriteMemory } = event.payload;
    
    if (rctx?.env?.enableAsyncMemoryWrite && canWriteMemory) {
      const supUrl = rctx.env.supabaseUrl;
      const supKey = rctx.env.supabaseServiceKey;
      if (rctx.tasks) {
        rctx.tasks.fire('MemoryWriteQueue', processMemoryWriteQueue(userId, message, supUrl, supKey));
      }
    }
  });
};
