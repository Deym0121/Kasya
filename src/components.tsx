import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TextStyle,
  TextInput,
  ScrollView,
  KeyboardTypeOptions,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, fonts, type as T, confidenceColor } from './theme';
import { METRIC_INFO, typicalBand, MetricKey } from './gait/metricInfo';

type IconName = ComponentProps<typeof Feather>['name'];

export function ScreenContainer({
  children,
  title,
  onBack,
  right,
  footer,
  edges = ['top', 'bottom'],
}: {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  /** tab screens pass ['top'] — the tab bar already consumes the bottom inset */
  edges?: Edge[];
}) {
  const showBar = !!(title || onBack || right);
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {showBar && (
        <View style={styles.topbar}>
          <View style={styles.side}>
            {onBack && (
              <Pressable
                onPress={onBack}
                hitSlop={12}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Feather name="chevron-left" size={24} color={colors.ink} />
              </Pressable>
            )}
          </View>
          <Text style={styles.topTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

const BTN = {
  primary: { box: { backgroundColor: colors.ink }, fg: colors.bg },
  accent: { box: { backgroundColor: colors.accent }, fg: colors.onDark },
  secondary: { box: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.lineStrong }, fg: colors.ink },
  ghost: { box: { backgroundColor: 'transparent' }, fg: colors.ink },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: keyof typeof BTN;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
}) {
  const v = BTN[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [styles.btn, v.box, pressed && styles.btnPressed, disabled && { opacity: 0.45 }]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={18} color={v.fg} style={{ marginRight: 8 }} />}
          <Text style={[styles.btnText, { color: v.fg }]}>{label}</Text>
          {iconRight && <Feather name={iconRight} size={18} color={v.fg} style={{ marginLeft: 8 }} />}
        </>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const inner = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.96 }}>
      {inner}
    </Pressable>
  ) : (
    inner
  );
}

export function IconBubble({
  icon,
  tint = colors.accentSoft,
  color = colors.accentInk,
  size = 46,
}: {
  icon: IconName;
  tint?: string;
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Feather name={icon} size={Math.round(size * 0.42)} color={color} />
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={T.label}>{children}</Text>;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  icon,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences';
  icon?: IconName;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {icon && <Feather name={icon} size={18} color={colors.muted} style={{ marginRight: 10 }} />}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && styles.chipOn]}
    >
      {icon && (
        <Feather
          name={icon}
          size={15}
          color={selected ? colors.bg : colors.inkSoft}
          style={{ marginRight: 7 }}
        />
      )}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({
  label,
  tint = colors.accentSoft,
  color = colors.accentInk,
}: {
  label: string;
  tint?: string;
  color?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: tint }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * Presentation-only wording for the stored high/medium/low confidence values —
 * "reading" language instead of lab-speak. Mirrored in report/reportHtml.ts.
 */
const CONFIDENCE_READING: Record<string, string> = {
  high: 'Solid reading',
  medium: 'Fair reading — rough estimate',
  low: 'Weak reading — worth re-scanning',
};

export function ConfidenceChip({ confidence }: { confidence: string }) {
  const c = confidenceColor[confidence] ?? colors.muted;
  const label = CONFIDENCE_READING[confidence] ?? `${confidence} confidence`;
  return (
    <View
      style={[styles.badge, { backgroundColor: c }]}
      accessibilityLabel={`${label}. Confidence is how clearly the camera saw your steps, not how good your walk is.`}
    >
      <Text style={[styles.badgeText, { color: colors.bg }]}>{label}</Text>
    </View>
  );
}

export function Dots({ count, index }: { count: number; index: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
      ))}
    </View>
  );
}

export function Disclaimer() {
  return (
    <Text style={styles.disc}>
      Kasya gives wellness and shoe-selection estimates — not medical advice or a diagnosis. For
      pain or injury, see a qualified professional.
    </Text>
  );
}

/** One metric tile. `band: 'outside'` warn-tints the value (never danger-red). */
export function Metric({
  label,
  value,
  unit,
  band = 'unknown',
  onPress,
  expanded,
  notMeasured,
}: {
  label: string;
  value: string | number;
  unit?: string;
  band?: 'typical' | 'outside' | 'unknown';
  onPress?: () => void;
  expanded?: boolean;
  /** renders '—' with no unit and reads "not measured" to screen readers */
  notMeasured?: boolean;
}) {
  const body = (
    <View style={styles.metric}>
      <Text style={[styles.metricVal, band === 'outside' && { color: colors.warn }]}>
        {notMeasured ? '—' : value}
        {!notMeasured && unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
        {band === 'outside' ? <Text style={{ color: colors.warn }}> •</Text> : null}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {onPress ? <Feather name="info" size={13} color={colors.muted} style={styles.metricHintIcon} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${
        notMeasured ? 'not measured' : `${value}${unit ? ` ${unit}` : ''}`
      }. Opens explanation`}
      accessibilityState={{ expanded: !!expanded }}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {body}
    </Pressable>
  );
}

export interface MetricGridItem {
  key: MetricKey;
  value: string | number;
  unit?: string;
  /** numeric value for band tinting when `value` is a formatted string */
  raw?: number;
}

const gridRaw = (it: MetricGridItem) => it.raw ?? (typeof it.value === 'number' ? it.value : 0);
/** analyzers emit 0 for "could not measure" — never render it as a real score */
const gridNotMeasured = (it: MetricGridItem) =>
  typicalBand(it.key, gridRaw(it)) === 'unknown' && gridRaw(it) === 0;

/**
 * Metric tiles + one tap-to-open plain-English explainer panel below the grid.
 * Labels/units/copy come from METRIC_INFO; outlier tinting from typicalBand.
 */
export function MetricGrid({ items, columns = 3 }: { items: MetricGridItem[]; columns?: 3 | 4 }) {
  const [openKey, setOpenKey] = useState<MetricKey | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!openKey) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 150,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [openKey, fade]);

  const open = openKey ? METRIC_INFO[openKey] : null;
  const openItem = openKey ? items.find((i) => i.key === openKey) : undefined;
  const openNotMeasured = !!openItem && gridNotMeasured(openItem);
  return (
    <View>
      <View style={styles.metricsWrap}>
        {items.map((it) => {
          const info = METRIC_INFO[it.key];
          const raw = gridRaw(it);
          // Legacy reports store unrounded floats — show at most 1 decimal on the
          // tile (and in its accessibility label); `raw` stays raw for band tinting.
          const shown = typeof it.value === 'number' ? Math.round(it.value * 10) / 10 : it.value;
          return (
            <View key={it.key} style={{ width: `${100 / columns}%` as const }}>
              <Metric
                label={info.label}
                value={shown}
                unit={it.unit ?? info.unit}
                band={typicalBand(it.key, raw)}
                notMeasured={gridNotMeasured(it)}
                onPress={() => setOpenKey(openKey === it.key ? null : it.key)}
                expanded={openKey === it.key}
              />
            </View>
          );
        })}
      </View>
      <Text style={[T.small, { marginTop: spacing.xs }]}>
        Tap any number to see what it means · an orange dot means it sat outside the typical range
        this scan — not danger.
      </Text>
      {open ? (
        <Animated.View style={[styles.metricPanel, { opacity: fade }]}>
          <Text style={styles.metricPanelTitle}>{open.label}</Text>
          <Text style={[T.body, { marginTop: 2 }]}>{open.plain}</Text>
          <Text style={[T.small, { marginTop: spacing.xs }]}>
            {openNotMeasured
              ? 'We couldn’t measure this from this scan — a clearer side-on capture usually fixes it.'
              : open.typical}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Friendly empty state — used by first-run Home and the zero-scan History tab. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.emptyCard}>
      <IconBubble icon={icon} tint={colors.surfaceAlt} color={colors.ink} size={56} />
      <Text style={[T.title, { marginTop: spacing.lg, textAlign: 'center' }]}>{title}</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, textAlign: 'center' }]}>{body}</Text>
      {action && (
        <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>
          <Button label={action.label} variant="secondary" onPress={action.onPress} />
        </View>
      )}
    </View>
  );
}

/** rAF count-up number (easeOutCubic). Snaps instantly under OS reduce-motion. */
export function AnimatedNumber({
  value,
  duration = 800,
  delay = 0,
  style,
  format,
}: {
  value: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<TextStyle>;
  format?: (v: number) => string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let mounted = true;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!mounted) return;
        if (reduce) {
          setDisplay(value);
          return;
        }
        let start = 0;
        const tick = (ts: number) => {
          if (!mounted) return;
          if (!start) start = ts;
          const p = Math.min(1, (ts - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(value * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        timer = setTimeout(() => {
          raf = requestAnimationFrame(tick);
        }, delay);
      });
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [value, duration, delay]);

  return <Text style={style}>{format ? format(display) : String(Math.round(display))}</Text>;
}

/** Mount entrance: fade + rise. Static under OS reduce-motion. */
export function Reveal({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    const t = Animated.timing(anim, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    t.start();
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (mounted && reduce) {
          t.stop();
          anim.setValue(1);
        }
      });
    return () => {
      mounted = false;
      t.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** The rotating "Today's focus" coaching tip card. */
export function CoachCard({ tip, source }: { tip: string; source: 'scan' | 'general' }) {
  return (
    <Card style={{ marginTop: spacing.md }}>
      <View style={styles.coachHead}>
        <IconBubble icon="message-circle" tint={colors.accentSoft} color={colors.accent} size={40} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Label>Today's focus</Label>
        </View>
        {source === 'scan' && <Badge label="From your last scan" />}
      </View>
      <Text style={[T.body, { marginTop: spacing.md }]}>{tip}</Text>
    </Card>
  );
}

/** Soft in-app notice with an action — used for the re-scan due banner. */
export function NoticeBanner({
  icon,
  text,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.notice}>
      <Feather name={icon} size={18} color={colors.accentInk} style={{ marginTop: 2 }} />
      <Text style={styles.noticeText}>{text}</Text>
      <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={10}>
        <Text style={styles.noticeAction}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  side: { width: 64, justifyContent: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  btn: {
    minHeight: 54,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    ...shadow.card,
  },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, marginBottom: spacing.sm },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, height: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.medium, fontSize: 15, color: colors.inkSoft },
  chipTextOn: { color: colors.bg },
  badge: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.sm },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.accent, width: 22 },
  disc: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.xl },
  metric: { paddingVertical: spacing.md },
  metricVal: { fontFamily: fonts.extra, fontSize: 24, color: colors.ink },
  metricUnit: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  metricLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 2 },
  metricHintIcon: { position: 'absolute', top: 4, right: spacing.sm, opacity: 0.7 },
  metricsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  metricPanel: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  metricPanelTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.card,
  },
  coachHead: { flexDirection: 'row', alignItems: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  noticeText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink },
  noticeAction: { fontFamily: fonts.bold, fontSize: 14, color: colors.accentInk },
});
