import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';
import type { Medal } from './levels';

/** Medal fills — readable with dark (`colors.bg`) numerals on top. */
export const MEDAL_COLORS: Record<Medal, string> = {
  gold: '#F2C14E',
  silver: '#C9CED6',
  bronze: '#D08A5A',
};

const MEDAL_NAME: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

/** A colored circle with the rank number — gold/silver/bronze, or neutral past 3rd. */
export function RankCircle({ rank, medal, size = 30 }: { rank: number; medal: Medal | null; size?: number }) {
  const fill = medal ? MEDAL_COLORS[medal] : colors.surfaceAlt;
  return (
    <View
      style={[styles.rankCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill }]}
      accessible
      accessibilityLabel={medal ? `${MEDAL_NAME[medal]} medal, rank ${rank}` : `Rank ${rank}`}
    >
      <Text style={[styles.rankText, { fontSize: Math.round(size * 0.42), color: medal ? colors.bg : colors.inkSoft }]}>
        {rank}
      </Text>
    </View>
  );
}

/** Podium medal: the rank circle with a small award ribbon badge. */
export function MedalBadge({ rank, medal, size }: { rank: number; medal: Medal; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <RankCircle rank={rank} medal={medal} size={size} />
      <View style={[styles.ribbon, { backgroundColor: MEDAL_COLORS[medal] }]} importantForAccessibility="no">
        <Feather name="award" size={12} color={colors.bg} />
      </View>
    </View>
  );
}

export function LevelChip({ level }: { level: number }) {
  return (
    <View style={styles.levelChip} accessible accessibilityLabel={`Level ${level}`}>
      <Text style={styles.levelChipText}>Lv {level}</Text>
    </View>
  );
}

export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[styles.segmentBtn, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Two-tap inline confirm (Alert.alert is a no-op on react-native-web — same
 * pattern as Profile's delete account). `confirm(key)` arms on the first tap
 * and returns true on the second tap within `ms`.
 */
export function useTwoTap(ms = 4000) {
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const confirm = useCallback(
    (key: string): boolean => {
      if (timer.current) clearTimeout(timer.current);
      if (armed === key) {
        setArmed(null);
        return true;
      }
      setArmed(key);
      timer.current = setTimeout(() => setArmed(null), ms);
      return false;
    },
    [armed, ms],
  );
  const disarm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setArmed(null);
  }, []);
  return { armed, confirm, disarm };
}

/** Inline result line under an action (success or error). */
export function Notice({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={[styles.notice, ok ? styles.noticeOk : styles.noticeErr]} accessibilityLiveRegion="polite">
      <Feather
        name={ok ? 'check-circle' : 'alert-circle'}
        size={18}
        color={ok ? colors.success : colors.danger}
        style={{ marginTop: 1 }}
      />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

/** The one-line privacy promise shown wherever groups are offered. */
export function PrivacyLine() {
  return (
    <View style={styles.privacy}>
      <Feather name="lock" size={14} color={colors.muted} />
      <Text style={styles.privacyText}>Only your daily totals are shared with your group members.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rankCircle: { alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: fonts.extra },
  ribbon: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  levelChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  levelChipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.accentInk },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 4,
  },
  segmentBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  segmentTextOn: { color: colors.onDark },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  noticeOk: { backgroundColor: colors.successSoft },
  noticeErr: { backgroundColor: colors.accentSoft },
  noticeText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  privacyText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
});
