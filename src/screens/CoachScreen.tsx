import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, fonts, radius, type as T } from '../theme';
import { Button } from '../components';
import { coachChat, CoachRateLimited, ChatMessage } from '../ai/coach';
import { buildCoachPlan } from '../gait/coach';
import { getPlan } from '../monetization/entitlements';
import { getAiUsage, bumpAiUsage, aiRemaining, DAILY_AI_LIMIT } from '../storage/aiQuota';

type Props = RootScreenProps<'Coach'>;

const QUICK = [
  'What should I focus on?',
  'How can I improve my cadence?',
  'What about my bounce?',
  'Are my left and right even?',
];

export default function CoachScreen({ navigation, route }: Props) {
  const { report } = route.params;

  const plan = useMemo(
    () =>
      buildCoachPlan({
        goal: report.scanType,
        cadenceSpm: report.result.cadence.value,
        captureOk: report.result.captureQuality.ok,
        bouncePct: report.metrics?.verticalOscillationPct,
        overstrideScore: report.metrics?.overstrideScore,
        rhythmPct: report.metrics?.rhythmRegularityPct,
        symmetryPct: report.metrics?.symmetryPct,
      }),
    [report],
  );

  const opener = useMemo(() => {
    const bullets = plan.items.map((i) => `• ${i.area}: ${i.cue}`).join('\n');
    return `${plan.headline}\n\n${bullets}\n\nAsk me anything about this scan.`;
  }, [plan]);

  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: opener }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState(DAILY_AI_LIMIT);
  const scrollRef = useRef<ScrollView>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    getPlan().then((p) => active && setPremium(p === 'premium'));
    getAiUsage().then((u) => active && setRemaining(aiRemaining(u)));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, busy]);

  useEffect(() => () => ctrl.current?.abort(), []);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy || !premium) return;
    if (remaining <= 0) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `You've used today's ${DAILY_AI_LIMIT} coach chats — they reset tomorrow. Your plan above still stands.` },
      ]);
      return;
    }
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    coachChat(report, next, c.signal)
      .then((reply) => {
        setMessages((m) => [...m, { role: 'assistant', content: reply }]);
        bumpAiUsage().then((u) => setRemaining(aiRemaining(u))); // count real replies against the daily 50
      })
      .catch((e) => {
        if (c.signal.aborted) return;
        const msg =
          e instanceof CoachRateLimited
            ? "I'm getting a lot of questions right now — give me a minute and ask again."
            : "I can't reach the AI just now. Once your OpenRouter key is set and the server is running (npm run server), I'll reply here live.";
        setMessages((m) => [...m, { role: 'assistant', content: msg }]);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Your coach</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.scope}>Only sees this scan's numbers · only talks about your gait</Text>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === 'user' ? styles.user : styles.assistant]}>
              <Text style={[styles.msg, m.role === 'user' ? styles.userMsg : styles.assistantMsg]}>{m.content}</Text>
            </View>
          ))}
          {busy ? (
            <View style={[styles.bubble, styles.assistant, styles.typing]}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : null}
        </ScrollView>

        {premium === false ? (
          <View style={styles.upsell}>
            <Text style={styles.upsellText}>
              Live AI coaching is a Premium feature — up to {DAILY_AI_LIMIT} chats a day. Your plan above is always
              free.
            </Text>
            <Button label="Upgrade to Premium" icon="star" onPress={() => navigation.navigate('Paywall')} />
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={styles.quickInner}>
              {QUICK.map((q) => (
                <Pressable key={q} onPress={() => send(q)} style={styles.quick} accessibilityRole="button" accessibilityLabel={q}>
                  <Text style={styles.quickText}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder={remaining > 0 ? 'Ask about your gait scan…' : 'Daily limit reached — resets tomorrow'}
                placeholderTextColor={colors.muted}
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
                editable={!busy && remaining > 0}
              />
              <Pressable
                onPress={() => send(input)}
                disabled={busy || !input.trim() || remaining <= 0}
                style={[styles.sendBtn, (busy || !input.trim() || remaining <= 0) && { opacity: 0.4 }]}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Feather name="arrow-up" size={20} color={colors.onDark} />
              </Pressable>
            </View>
            <Text style={styles.quota}>
              {remaining > 0
                ? `${remaining} of ${DAILY_AI_LIMIT} coach chats left today`
                : 'Daily limit reached — resets tomorrow'}
            </Text>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topbar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  scope: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginBottom: spacing.sm },
  thread: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  bubble: { maxWidth: '86%', borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  assistant: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderTopLeftRadius: radius.sm },
  user: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderTopRightRadius: radius.sm },
  typing: { paddingVertical: spacing.md },
  msg: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  assistantMsg: { color: colors.ink },
  userMsg: { color: colors.bg },
  quickRow: { flexGrow: 0 },
  quickInner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  quick: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  quickText: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  quota: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 11, color: colors.muted, paddingBottom: spacing.md },
  upsell: {
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surfaceAlt,
  },
  upsellText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
});

