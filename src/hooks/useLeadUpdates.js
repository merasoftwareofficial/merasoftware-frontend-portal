import { useEffect, useRef, useState } from 'react';

// A single live subscription for the current tab, shared by all mounted lead
// views. IDs are notifications, never a client data cache.
const subscribers = new Set();
let source, timer, reconnectTimer, all = false, disconnected = false;
const ids = new Set();
function schedule(message) {
  all ||= message.all || message.type === 'ready' || message.type === 'resync';
  for (const id of message.ids || []) ids.add(id);
  if (document.visibilityState !== 'visible' || timer) return;
  timer = setTimeout(() => {
    timer = null;
    const update = { all, ids: [...ids] }; all = false; ids.clear();
    for (const listener of subscribers) listener.update(update);
  }, 200);
}
function status(value) { for (const listener of subscribers) listener.status(value); }
function connect() {
  if (source || !subscribers.size || document.visibilityState !== 'visible') return;
  if (typeof EventSource === 'undefined') { status('unavailable'); return; }
  source = new EventSource(`${process.env.REACT_APP_BACKEND_URL}/api/admin/lead-updates`, { withCredentials: true });
  source.onmessage = event => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'denied') { source?.close(); source = null; status('unavailable'); return; }
    if (message.type === 'unavailable') { retry(); return; }
    if (message.type === 'ready') { disconnected = false; status('connected'); }
    schedule(message);
  };
  source.onerror = retry;
}
function retry() {
  source?.close(); source = null; disconnected = true; status('unavailable');
  if (!reconnectTimer && subscribers.size) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 5000);
}
function visible() {
  if (document.visibilityState !== 'visible') {
    source?.close(); source = null; clearTimeout(timer); timer = null; clearTimeout(reconnectTimer); reconnectTimer = null;
    return;
  }
  connect();
  if (all || ids.size || disconnected) schedule({ type: 'resync' });
}
export function useLeadUpdates(onUpdate, leadId) {
  const callback = useRef(onUpdate); callback.current = onUpdate;
  const [liveStatus, setLiveStatus] = useState('connecting');
  useEffect(() => {
    const listener = { status: setLiveStatus, update: change => {
      if (!leadId || change.all || change.ids.includes(leadId)) callback.current();
    } };
    subscribers.add(listener);
    if (subscribers.size === 1) {
      document.addEventListener('visibilitychange', visible);
      window.addEventListener('online', visible);
    }
    connect();
    return () => {
      subscribers.delete(listener);
      if (!subscribers.size) {
        source?.close(); source = null; clearTimeout(timer); timer = null;
        clearTimeout(reconnectTimer); reconnectTimer = null; ids.clear(); all = false; disconnected = false;
        document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible);
      }
    };
  }, [leadId]);
  return liveStatus;
}
