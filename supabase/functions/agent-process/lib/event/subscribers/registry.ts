import { registerAuditSubscribers } from './audit_subscriber.ts';
import { registerMemorySubscribers } from './memory_subscriber.ts';

let isRegistered = false;

export const initializeEventSubscribers = () => {
  if (isRegistered) return;
  
  registerAuditSubscribers();
  registerMemorySubscribers();
  
  isRegistered = true;
};
