import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { session } from './session';
import { computeSplits } from './splits';
import { kmCueText } from './cues';

/**
 * Per-km voice cues ("Kilometer 3. Pace 5:32…"), driven by the session itself.
 * They play only while Kasya is on screen: the app declares no `audio`
 * background mode (App Review 2.5.4 rejected it for spoken cues), so a km
 * crossed with the phone locked passes silently instead of being spoken late.
 * A ducking playback session lets the voice play over the runner's music.
 * Imported once at startup (index.ts). Native modules are required lazily.
 */
const KEY = 'kasya:voicecues:v1';
let enabled = true;
let loaded = false;
let sessionId: string | null = null;
let lastKm = 0;
let audioReady = false;

export async function getVoiceCues(): Promise<boolean> {
  if (!loaded) {
    try {
      enabled = (await AsyncStorage.getItem(KEY)) !== '0';
    } catch {
      enabled = true;
    }
    loaded = true;
  }
  return enabled;
}

export async function setVoiceCues(on: boolean): Promise<void> {
  enabled = on;
  loaded = true;
  if (!on) stopSpeaking();
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
}

/** Play over music (ducking it), even with the ringer switch on silent. */
async function prepareAudio() {
  if (audioReady || Platform.OS === 'web') return;
  audioReady = true;
  try {
    const { setAudioModeAsync } = require('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
  } catch {
    audioReady = false;
  }
}

function speak(text: string) {
  try {
    const Speech = require('expo-speech');
    Speech.speak(text, { language: 'en-US', rate: Platform.OS === 'ios' ? 0.52 : 1.0 });
  } catch {
    // no TTS on this device — cues are a nice-to-have
  }
}

function stopSpeaking() {
  try {
    require('expo-speech').stop();
  } catch {
    // ignore
  }
}

session.subscribe(() => {
  const snap = session.getSnapshot();
  const stats = snap.stats;
  if (!snap.active || !stats || !snap.id) {
    sessionId = null;
    return;
  }
  const km = Math.floor(stats.distanceM / 1000);
  if (snap.id !== sessionId) {
    // a new (or restored) recording: start counting from where it is now
    sessionId = snap.id;
    lastKm = km;
    void getVoiceCues().then((on) => {
      if (on) void prepareAudio();
    });
    return;
  }
  if (km <= lastKm) return;
  lastKm = km;
  if (!enabled || stats.status !== 'recording') return;
  // Foreground only (no background audio mode): skip, don't queue, a cue we can't play now.
  if (Platform.OS !== 'web' && AppState.currentState !== 'active') return;
  const rec = session.recorder;
  const splits = rec ? computeSplits(rec.points) : [];
  const done = splits.filter((s) => s.distanceM >= 999);
  const split = done[done.length - 1];
  speak(kmCueText({ sport: stats.sport, km, splitPaceSec: split?.paceSecPerKm ?? null, movingSec: stats.movingSec }));
});
