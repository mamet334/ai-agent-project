import { registerAuditSubscribers } from './audit_subscriber.ts';
import { registerMemorySubscribers } from './memory_subscriber.ts';
import { initializeToolSubscriber } from './tool_subscriber.ts';
import { registerLifecycleSubscribers } from './lifecycle_subscriber.ts';

let isRegistered = false;

export const initializeEventSubscribers = () => {
  if (isRegistered) return;
  
  registerAuditSubscribers();
  registerMemorySubscribers();
  initializeToolSubscriber();
  registerLifecycleSubscribers();
  
  isRegistered = true;
};
