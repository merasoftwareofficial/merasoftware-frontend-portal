import { usePortalUpdates } from './usePortalUpdates';
export function useLeadUpdates(onUpdate, leadId) {
  return usePortalUpdates(onUpdate, ['leads'], leadId);
}
