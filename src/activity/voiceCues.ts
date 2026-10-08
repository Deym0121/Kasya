import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { session } from './session';
import { computeSplits } from './splits';
import { kmCueText } from './cues';

/**
 * Per-km voice cues ("Kilometer 3. Pace 5:32…"). Driven by the session itself,
 * not by a screen, so cues keep coming with the phone locked in a pocket:
 * background GPS keeps JS alive, and on iOS the `audio` background mode plus
 * a ducking playback session let the voice play over the runner's music.
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

/** Play over music (ducking it) and keep speaking with the screen locked. */
async function prepareAudio() {
  if (audioReady || Platform.OS === 'web') return;
  audioReady = true;
  try {
    const { setAudioModeAsync } = require('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
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
  const rec = session.recorder;
  const splits = rec ? computeSplits(rec.points) : [];
  const done = splits.filter((s) => s.distanceM >= 999);
  const split = done[done.length - 1];
  speak(kmCueText({ sport: stats.sport, km, splitPaceSec: split?.paceSecPerKm ?? null, movingSec: stats.movingSec }));
});
