import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { session, type SessionSnapshot } from './session';

/** The live recording snapshot (re-renders on every accepted fix). */
export function useRecording(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** Just "is something recording?" — re-renders only when that flips, not on every fix. */
export function useRecordingActive(): boolean {
  const get = () => session.getSnapshot().active;
  return useSyncExternalStore(session.subscribe, get, get);
}

/**
 * Wall-clock ticker for live timers. Ticks only while `active` AND the app is
 * in the foreground — a locked phone mid-marathon shouldn't re-render the UI
 * every second for hours (GPS keeps recording regardless).
 */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, foreground, everyMs]);
  return now;
}
