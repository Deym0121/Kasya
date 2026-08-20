import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConvex } from '../convex/client';
import { api } from '../../convex/_generated/api';
import { resolveRaces, RaceSource } from './source';
import type { RaceEvent } from './types';
import seedJson from '../data/raceSeed.json';

const CACHE_KEY = 'kasya:races:v1';
const LIVE_TIMEOUT_MS = 5000;

const SEED: RaceEvent[] = (seedJson as { events: RaceEvent[] }).events;

async function fetchLive(): Promise<RaceEvent[] | null> {
  const convex = getConvex();
  if (!convex) return null;
  // Never hold the tab hostage on a slow connection — cache/seed render fine.
  return Promise.race<RaceEvent[] | null>([
    convex.query(api.races.list, {}) as Promise<RaceEvent[]>,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_TIMEOUT_MS)),
  ]);
}

async function readCache(): Promise<RaceEvent[] | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RaceEvent[]) : null;
  } catch {
    return null;
  }
}

export function useRaces(): { events: RaceEvent[]; source: RaceSource; loading: boolean } {
  const [state, setState] = useState<{ events: RaceEvent[]; source: RaceSource; loading: boolean }>({
    events: SEED,
    source: 'seed',
    loading: true,
  });

  useEffect(() => {
    let active = true;
    resolveRaces({
      fetchLive,
      readCache,
      seed: SEED,
      writeCache: (events) => AsyncStorage.setItem(CACHE_KEY, JSON.stringify(events)),
    }).then((r) => {
      if (active) setState({ ...r, loading: false });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
