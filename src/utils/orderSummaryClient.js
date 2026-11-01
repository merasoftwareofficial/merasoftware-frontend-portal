import SummaryApi from '../common';
import { cancelResourceReads, readResource } from './resourceClient';

// Every completed read is fresh next time. Legacy force callers still share
// pending requests: no completed-response cache remains.
export const getOrderSummary = async ({ signal } = {}) => {
  const data = await readResource(SummaryApi.ordersList.url, { signal });
  return Array.isArray(data) ? data : [];
};
export const clearOrderSummary = cancelResourceReads;
