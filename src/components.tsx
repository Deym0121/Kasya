import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  TextInput,
  ScrollView,
  KeyboardTypeOptions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, fonts, type as T, confidenceColor } from './theme';

type IconName = ComponentProps<typeof Feather>['name'];

export function ScreenContainer({
  children,
  title,
  onBack,
  right,
  footer,
}: {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
}) {
  const showBar = !!(title || onBack || right);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {showBar && (
        <View style={styles.topbar}>
          <View style={styles.side}>
            {onBack && (
              <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
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
  primary: { box: { backgroundColor: colors.ink }, fg: colors.onDark },
  accent: { box: { backgroundColor: colors.accent }, fg: colors.onDark },
  secondary: { box: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.ink }, fg: colors.ink },
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
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.96 }}>
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
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      {icon && (
        <Feather
          name={icon}
          size={15}
          color={selected ? colors.onDark : colors.inkSoft}
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

export function ConfidenceChip({ confidence }: { confidence: string }) {
  const c = confidenceColor[confidence] ?? colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: c }]}>
      <Text style={[styles.badgeText, { color: '#fff' }]}>{confidence} confidence</Text>
    </View>
  );
}

export function Dots({ count, index }: { count: number; index: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
      ))}
    </View>
  );
}

export function Disclaimer() {
  return (
    <Text style={styles.disc}>
      StrideFit gives wellness and shoe-selection estimates — not medical advice or a diagnosis. For
      pain or injury, see a qualified professional.
    </Text>
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
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.medium, fontSize: 15, color: colors.inkSoft },
  chipTextOn: { color: colors.onDark },
  badge: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.sm },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.accent, width: 22 },
  disc: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.xl },
});
