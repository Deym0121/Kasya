import { useCallback, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import {
  ScreenContainer,
  Button,
  Card,
  Chip,
  TextField,
  Badge,
  EmptyState,
  Label,
  NoticeBanner,
  IconBubble,
} from '../components';
import { getPlan } from '../monetization/entitlements';
import { COUNTRIES, DISTANCES, countryFor } from '../races/types';
import type { RaceCountryCode, RaceDistance } from '../races/types';
import { parseRaceDate } from '../races/logic';
import {
  SUBMISSION_LIMITS as L,
  formatDateInput,
  submissionStatusCopy,
  todayIsoLocal,
  validateSubmission,
} from '../races/submission';
import type { StatusTone, SubmissionErrors } from '../races/submission';
import { amIAdmin, loadMySubmissions, submitRace } from '../races/submissionsApi';
import type { MySubmission, SubmitAvailability } from '../races/submissionsApi';

type Props = RootScreenProps<'RaceSubmit'>;
type Phase = 'loading' | SubmitAvailability | 'not_pro';
type IconName = ComponentProps<typeof Feather>['name'];

interface Form {
  name: string;
  dateStart: string;
  dateEnd: string;
  city: string;
  country: RaceCountryCode;
  distances: RaceDistance[];
  officialUrl: string;
  registrationUrl: string;
  organizer: string;
}

const EMPTY_FORM: Form = {
  name: '',
  dateStart: '',
  dateEnd: '',
  city: '',
  country: 'PH',
  distances: [],
  officialUrl: '',
  registrationUrl: '',
  organizer: '',
};

const TONE: Record<StatusTone, { tint: string; color: string }> = {
  pending: { tint: colors.warnSoft, color: colors.warn },
  published: { tint: colors.successSoft, color: colors.success },
  declined: { tint: colors.surfaceAlt, color: colors.inkSoft },
};

// Intl-free, like the rest of src/races (Hermes).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string): string {
  const d = parseRaceDate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const STEPS: { icon: IconName; text: string }[] = [
  { icon: 'send', text: 'You send the race and its official page.' },
  { icon: 'search', text: 'Kasya checks that page for the race name and date.' },
  { icon: 'check-circle', text: 'The Kasya team approves it — then it’s live for every runner.' },
];

function SubmissionRow({ s }: { s: MySubmission }) {
  const copy = submissionStatusCopy(s.status);
  const tone = TONE[copy.tone];
  const place = `${s.city}, ${countryFor(s.country as RaceCountryCode).name}`;
  return (
    <View style={styles.subRow} accessible accessibilityLabel={`${s.name}, ${copy.label}. ${s.reason}`}>
      <View style={styles.subHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subName} numberOfLines={2}>{s.name}</Text>
          <Text style={styles.subMeta}>{shortDate(s.dateStart)} · {place}</Text>
        </View>
        <Badge label={copy.label} tint={tone.tint} color={tone.color} />
      </View>
      <Text style={styles.subReason}>{s.reason}</Text>
    </View>
  );
}

function MySubmissionsList({ subs }: { subs: MySubmission[] }) {
  return (
    <View style={{ marginTop: spacing.xxl }}>
      <Label>My submissions</Label>
      {subs.length === 0 ? (
        <Text style={[T.small, { marginTop: spacing.sm }]}>
          Nothing yet — races you submit show up here with their review status.
        </Text>
      ) : (
        subs.map((s) => <SubmissionRow key={s.id} s={s} />)
      )}
    </View>
  );
}

export default function RaceSubmitScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [subs, setSubs] = useState<MySubmission[]>([]);
  const [admin, setAdmin] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<SubmissionErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const [ctx, plan, isAdmin] = await Promise.all([
      loadMySubmissions(),
      getPlan().catch(() => 'free' as const),
      amIAdmin(),
    ]);
    if (!alive.current) return;
    setSubs(ctx.submissions);
    setAdmin(isAdmin);
    if (ctx.availability !== 'ready') setPhase(ctx.availability);
    else setPhase(plan === 'premium' ? 'ready' : 'not_pro');
  }, []);

  // Re-check on every focus: coming back from the Paywall or SignIn changes the answer.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  const today = useMemo(() => todayIsoLocal(), []);
  const check = useMemo(() => validateSubmission(form, today), [form, today]);
  const errors: SubmissionErrors = showErrors ? { ...(check.ok ? {} : check.errors), ...serverErrors } : {};

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setServerErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
    setNotice((n) => (n?.ok ? null : n));
  }

  function toggleDistance(d: RaceDistance) {
    set('distances', form.distances.includes(d) ? form.distances.filter((x) => x !== d) : [...form.distances, d]);
  }

  async function onSubmit() {
    if (submitting) return;
    setShowErrors(true);
    setNotice(null);
    if (!check.ok) {
      setNotice({ ok: false, text: 'A few details need fixing — see the highlighted fields.' });
      return;
    }
    setSubmitting(true);
    const res = await submitRace(check.value);
    if (!alive.current) return;
    setSubmitting(false);
    if (res.ok) {
      setForm({ ...EMPTY_FORM, country: form.country });
      setShowErrors(false);
      setServerErrors({});
      setNotice({
        ok: true,
        text: 'Thanks! We’re checking the official page now, and the Kasya team reviews every race before it goes live. Follow it under My submissions.',
      });
      load();
      return;
    }
    if (res.notPro) return setPhase('not_pro');
    if (res.signedOut) return setPhase('signed_out');
    setServerErrors(res.errors ?? {});
    setNotice({ ok: false, text: res.message });
  }

  const retry = () => {
    setPhase('loading');
    load();
  };

  const adminBanner = admin ? (
    <NoticeBanner
      icon="shield"
      text="You’re on the Kasya team — review what runners have sent in."
      actionLabel="Review"
      onAction={() => navigation.navigate('RaceAdmin')}
    />
  ) : null;

  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (phase === 'no_cloud') {
    body = (
      <EmptyState
        icon="flag"
        title="Race submissions open soon"
        body="Adding races needs a Kasya account, which this version doesn’t support yet. The race calendar works as usual."
      />
    );
  } else if (phase === 'unavailable') {
    body = (
      <EmptyState
        icon="flag"
        title="Race submissions open soon"
        body="We couldn’t reach race submissions just now. Check back a little later — the calendar itself works as usual."
        action={{ label: 'Try again', onPress: retry }}
      />
    );
  } else if (phase === 'signed_out') {
    body = (
      <EmptyState
        icon="user"
        title="Sign in to submit a race"
        body="Submissions are tied to your Kasya account so you can follow their review. Sign in with Apple or Google, then come back to Races."
        action={{ label: 'Sign in', onPress: () => navigation.navigate('SignIn') }}
      />
    );
  } else if (phase === 'not_pro') {
    body = (
      <>
        <Card>
          <View style={styles.proHead}>
            <IconBubble icon="star" size={40} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Label>Kasya Pro</Label>
              <Text style={[T.title, { marginTop: 2 }]}>Add races to the calendar</Text>
            </View>
          </View>
          <Text style={[T.body, { marginTop: spacing.md }]}>
            Submitting races is part of Kasya Pro. It keeps the calendar to real, officially announced races —
            every one is checked and approved by the Kasya team.
          </Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="See Kasya Pro" variant="accent" icon="star" onPress={() => navigation.navigate('Paywall')} />
          </View>
        </Card>
        {subs.length > 0 ? <MySubmissionsList subs={subs} /> : null}
      </>
    );
  } else {
    body = (
      <>
        <Card>
          <Text style={T.h2}>Add a race to the calendar</Text>
          <Text style={[T.body, { marginTop: spacing.sm }]}>
            Real, officially announced races only. We check every submission against its official page, and the
            Kasya team approves it before it appears for everyone.
          </Text>
          <View style={styles.steps}>
            {STEPS.map((step, i) => (
              <View key={step.icon} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <TextField
            label="Race name"
            value={form.name}
            onChangeText={(t) => set('name', t)}
            placeholder="e.g. Manila Marathon 2027"
            autoCapitalize="words"
            maxLength={L.nameMax}
            error={errors.name}
          />
          <TextField
            label="Race date"
            value={form.dateStart}
            onChangeText={(t) => set('dateStart', formatDateInput(t))}
            placeholder="YYYY-MM-DD"
            keyboardType="number-pad"
            icon="calendar"
            maxLength={10}
            error={errors.dateStart}
            hint="Race day exactly as the official page lists it."
          />
          <TextField
            label="Last day (optional)"
            value={form.dateEnd}
            onChangeText={(t) => set('dateEnd', formatDateInput(t))}
            placeholder="YYYY-MM-DD"
            keyboardType="number-pad"
            icon="calendar"
            maxLength={10}
            error={errors.dateEnd}
            hint="Only for multi-day events."
          />

          <Text style={styles.groupLabel}>Country</Text>
          <View style={styles.chipWrap}>
            {COUNTRIES.map((c) => (
              <Chip key={c.code} label={c.name} selected={form.country === c.code} onPress={() => set('country', c.code)} />
            ))}
          </View>
          {errors.country ? <Text style={styles.groupError}>{errors.country}</Text> : null}

          <View style={{ height: spacing.md }} />
          <TextField
            label="City"
            value={form.city}
            onChangeText={(t) => set('city', t)}
            placeholder="e.g. Pasay City"
            autoCapitalize="words"
            icon="map-pin"
            maxLength={L.cityMax}
            error={errors.city}
          />

          <Text style={styles.groupLabel}>Distances</Text>
          <View style={styles.chipWrap}>
            {DISTANCES.map((d) => (
              <Chip key={d} label={d} selected={form.distances.includes(d)} onPress={() => toggleDistance(d)} />
            ))}
          </View>
          {errors.distances ? <Text style={styles.groupError}>{errors.distances}</Text> : null}

          <View style={{ height: spacing.md }} />
          <TextField
            label="Official race page"
            value={form.officialUrl}
            onChangeText={(t) => set('officialUrl', t.trim())}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            icon="globe"
            maxLength={L.urlMax}
            error={errors.officialUrl}
            hint="The organizer’s own page for this race — we look for the name and date there."
          />
          <TextField
            label="Registration link (optional)"
            value={form.registrationUrl}
            onChangeText={(t) => set('registrationUrl', t.trim())}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            icon="external-link"
            maxLength={L.urlMax}
            error={errors.registrationUrl}
          />
          <TextField
            label="Organizer (optional)"
            value={form.organizer}
            onChangeText={(t) => set('organizer', t)}
            placeholder="e.g. RunRio"
            autoCapitalize="words"
            icon="briefcase"
            maxLength={L.organizerMax}
            error={errors.organizer}
          />
        </View>

        {notice ? (
          <View
            style={[styles.notice, notice.ok ? styles.noticeOk : styles.noticeErr]}
            accessibilityLiveRegion="polite"
          >
            <Feather
              name={notice.ok ? 'check-circle' : 'alert-circle'}
              size={18}
              color={notice.ok ? colors.success : colors.danger}
              style={{ marginTop: 1 }}
            />
            <Text style={styles.noticeText}>{notice.text}</Text>
          </View>
        ) : null}

        <Button label="Submit for review" variant="accent" icon="send" onPress={onSubmit} loading={submitting} />
        <Text style={styles.fine}>
          By submitting, you confirm this is a real, officially announced race. Duplicates and races we can’t verify
          are declined.
        </Text>

        <MySubmissionsList subs={subs} />
      </>
    );
  }

  return (
    <ScreenContainer
      title="Submit a race"
      onBack={() => navigation.goBack()}
      keyboardAware
      right={
        phase === 'ready' || phase === 'not_pro' ? (
          <Pressable
            onPress={load}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Refresh my submissions"
            style={styles.iconBtn}
          >
            <Feather name="refresh-cw" size={18} color={colors.ink} />
          </Pressable>
        ) : undefined
      }
    >
      {adminBanner}
      {body}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  proHead: { flexDirection: 'row', alignItems: 'center' },
  steps: { marginTop: spacing.lg, gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: fonts.bold, fontSize: 12, color: colors.accentInk },
  stepText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  groupLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, marginBottom: spacing.sm },
  groupError: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.danger, marginTop: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
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
  fine: { ...T.small, marginTop: spacing.md, textAlign: 'center' },
  subRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  subHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  subName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  subMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  subReason: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: spacing.sm },
});
