import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, Chip, TextField, Badge, EmptyState, Label } from '../components';
import { countryFor } from '../races/types';
import type { RaceCountryCode } from '../races/types';
import { parseRaceDate } from '../races/logic';
import { SUBMISSION_LIMITS, hostOf } from '../races/submission';
import {
  amIAdmin,
  approveSubmission,
  listOpenReports,
  listPendingSubmissions,
  recheckSubmission,
  rejectSubmission,
  resolveReport,
} from '../races/submissionsApi';
import type { OpenReport, PendingSubmission } from '../races/submissionsApi';

/**
 * Admin review queue (ADMIN_EMAILS only — the server enforces it; this screen
 * just hides itself for everyone else). Built for one founder approving from
 * a phone: one card per race, the automated checks up top, the official page
 * one tap away, and two-tap Approve so a stray tap never publishes.
 */

type Props = RootScreenProps<'RaceAdmin'>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function raceDate(start: string, end: string | null): string {
  const d = parseRaceDate(start);
  const base = `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (!end) return base;
  const e = parseRaceDate(end);
  return `${base} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
}

function ago(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Quick picks (short chip label → the note the runner actually sees). */
const REJECT_NOTES = [
  { label: 'Can’t verify', note: 'We couldn’t verify this race on its official page.' },
  { label: 'Already listed', note: 'This race is already in the calendar.' },
  { label: 'Not a race', note: 'This doesn’t look like a running event.' },
  { label: 'Wrong date', note: 'The date doesn’t match the official page.' },
];

const VERDICT = {
  legit: { label: 'AI: looks legit', tint: colors.successSoft, color: colors.success },
  doubtful: { label: 'AI: doubtful', tint: colors.warnSoft, color: colors.warn },
  unavailable: { label: 'AI: not run', tint: colors.surfaceAlt, color: colors.inkSoft },
} as const;

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.checkRow} accessible accessibilityLabel={`${label}: ${ok ? 'yes' : 'no'}`}>
      <Feather name={ok ? 'check-circle' : 'x-circle'} size={15} color={ok ? colors.success : colors.danger} />
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

const open = (url: string | null) => url && Linking.openURL(url).catch(() => {});

function ReviewCard({ sub, onDone }: { sub: PendingSubmission; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'recheck'>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const v = sub.verification;
  const country = countryFor(sub.country as RaceCountryCode);

  async function run(kind: 'approve' | 'reject' | 'recheck', call: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(kind);
    setError(null);
    const res = await call();
    setBusy(null);
    if (res.ok) onDone(res.message);
    else setError(res.message);
  }

  function approve() {
    if (!confirmApprove) {
      setConfirmApprove(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmApprove(false), 4000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmApprove(false);
    run('approve', () => approveSubmission(sub.id));
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.name}>{sub.name}</Text>
      <Text style={styles.meta}>{raceDate(sub.dateStart, sub.dateEnd)}</Text>
      <Text style={styles.meta}>
        {sub.city}, {country.name} · {sub.distances.join(' · ')}
      </Text>
      {sub.organizer ? <Text style={styles.meta}>By {sub.organizer}</Text> : null}
      <Text style={styles.submitted}>Submitted {ago(sub.createdAt)}</Text>

      <View style={styles.checks}>
        {v ? (
          <>
            <CheckRow ok={v.urlReachable} label="Official page opened" />
            <CheckRow ok={v.nameFound} label="Race name found on the page" />
            <CheckRow ok={v.dateFound} label="Race date found on the page" />
            <View style={{ marginTop: spacing.sm }}>
              <Badge label={VERDICT[v.aiVerdict].label} tint={VERDICT[v.aiVerdict].tint} color={VERDICT[v.aiVerdict].color} />
            </View>
            {v.aiSummary ? <Text style={styles.summary}>{v.aiSummary}</Text> : null}
          </>
        ) : (
          <View style={styles.checkRow}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={styles.checkText}>Checking the official page…</Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => open(sub.officialUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Open official page, ${hostOf(sub.officialUrl)}`}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
      >
        <Feather name="globe" size={16} color={colors.accentInk} />
        <Text style={styles.linkText} numberOfLines={1}>Open official page · {hostOf(sub.officialUrl)}</Text>
        <Feather name="external-link" size={14} color={colors.muted} />
      </Pressable>
      {sub.registrationUrl ? (
        <Pressable
          onPress={() => open(sub.registrationUrl)}
          accessibilityRole="link"
          accessibilityLabel={`Open registration page, ${hostOf(sub.registrationUrl)}`}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
        >
          <Feather name="edit-3" size={16} color={colors.muted} />
          <Text style={styles.linkTextMuted} numberOfLines={1}>Registration · {hostOf(sub.registrationUrl)}</Text>
          <Feather name="external-link" size={14} color={colors.muted} />
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {rejecting ? (
        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Note to the runner"
            value={note}
            onChangeText={setNote}
            placeholder="Why it wasn’t approved"
            maxLength={SUBMISSION_LIMITS.reviewNoteMax}
          />
          <View style={styles.chipWrap}>
            {REJECT_NOTES.map((n) => (
              <Chip key={n.label} label={n.label} selected={note === n.note} onPress={() => setNote(n.note)} />
            ))}
          </View>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="Cancel" variant="ghost" onPress={() => setRejecting(false)} disabled={!!busy} />
            </View>
            <View style={styles.action}>
              <Button
                label="Reject"
                variant="secondary"
                loading={busy === 'reject'}
                disabled={!!busy}
                onPress={() => run('reject', () => rejectSubmission(sub.id, note))}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label="Reject"
              variant="secondary"
              disabled={!!busy}
              onPress={() => {
                setRejecting(true);
                setConfirmApprove(false);
              }}
            />
          </View>
          <View style={styles.action}>
            <Button
              label={confirmApprove ? 'Publish' : 'Approve'}
              variant="accent"
              loading={busy === 'approve'}
              disabled={!!busy}
              onPress={approve}
            />
          </View>
        </View>
      )}
      {confirmApprove && !rejecting ? (
        <Text style={styles.confirmHint}>Tap Publish to add it to the calendar for every runner.</Text>
      ) : null}
      {!rejecting && (!v || v.aiVerdict === 'unavailable') ? (
        <Pressable
          onPress={() => run('recheck', () => recheckSubmission(sub.id))}
          disabled={!!busy}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.recheck}
        >
          {busy === 'recheck' ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Text style={styles.recheckText}>Run the page check again</Text>
          )}
        </Pressable>
      ) : null}
    </Card>
  );
}

function ReportCard({
  report,
  onOpen,
  onDone,
}: {
  report: OpenReport;
  onOpen: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ev = report.event;
  return (
    <Card style={styles.card}>
      <Text style={styles.name}>{ev ? ev.name : report.eventId}</Text>
      <Text style={styles.meta}>
        {ev ? `${raceDate(ev.dateStart, ev.dateEnd ?? null)} · ${ev.source === 'community' ? 'community' : 'curated'}` : 'Not in the calendar any more'}
      </Text>
      <Text style={styles.reason}>“{report.reason}”</Text>
      <Text style={styles.submitted}>Reported {ago(report.createdAt)}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {ev ? (
          <View style={styles.action}>
            <Button label="Open race" variant="ghost" onPress={onOpen} />
          </View>
        ) : null}
        <View style={styles.action}>
          <Button
            label="Resolved"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              const res = await resolveReport(report.id);
              setBusy(false);
              if (res.ok) onDone(res.message);
              else setError(res.message);
            }}
          />
        </View>
      </View>
    </Card>
  );
}

export default function RaceAdminScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<'loading' | 'not_admin' | 'unavailable' | 'ready'>('loading');
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [reports, setReports] = useState<OpenReport[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const isAdmin = await amIAdmin();
    if (!alive.current) return;
    if (!isAdmin) return setPhase('not_admin');
    const [p, r] = await Promise.all([listPendingSubmissions(), listOpenReports()]);
    if (!alive.current) return;
    if (p === null) return setPhase('unavailable');
    setPending(p);
    setReports(r ?? []);
    setPhase('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  const done = (message: string) => {
    setFlash(message);
    load();
  };

  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (phase === 'not_admin') {
    body = (
      <EmptyState
        icon="lock"
        title="Kasya team only"
        body="This review queue is for the Kasya team. Races you submit show up under Races → Submit a race."
      />
    );
  } else if (phase === 'unavailable') {
    body = (
      <EmptyState
        icon="cloud-off"
        title="Couldn’t load the queue"
        body="Race submissions aren’t reachable right now (not deployed yet, or you’re offline)."
        action={{ label: 'Try again', onPress: () => { setPhase('loading'); load(); } }}
      />
    );
  } else {
    body = (
      <>
        {flash ? (
          <View style={styles.flash} accessibilityLiveRegion="polite">
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.flashText}>{flash}</Text>
          </View>
        ) : null}
        <Label>Waiting for review · {pending.length}</Label>
        {pending.length === 0 ? (
          <Text style={[T.small, { marginTop: spacing.sm }]}>All caught up — nothing to review.</Text>
        ) : (
          pending.map((s) => <ReviewCard key={s.id} sub={s} onDone={done} />)
        )}
        <View style={{ height: spacing.xxl }} />
        <Label>Reported problems · {reports.length}</Label>
        {reports.length === 0 ? (
          <Text style={[T.small, { marginTop: spacing.sm }]}>No open reports.</Text>
        ) : (
          reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onDone={done}
              onOpen={() => r.event && navigation.navigate('RaceDetail', { event: r.event })}
            />
          ))
        )}
      </>
    );
  }

  return (
    <ScreenContainer
      title="Review races"
      onBack={() => navigation.goBack()}
      keyboardAware
      right={
        phase === 'ready' ? (
          <Pressable onPress={() => { setFlash(null); load(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Refresh" style={styles.iconBtn}>
            <Feather name="refresh-cw" size={18} color={colors.ink} />
          </Pressable>
        ) : undefined
      }
    >
      {body}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  card: { marginTop: spacing.md, padding: spacing.lg },
  name: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginTop: 2 },
  submitted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: spacing.xs },
  checks: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  checkText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  summary: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: spacing.sm },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  linkText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.accentInk },
  linkTextMuted: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  error: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.danger, marginTop: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: -spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  action: { flex: 1 },
  confirmHint: { fontFamily: fonts.medium, fontSize: 12, color: colors.accentInk, textAlign: 'center', marginTop: spacing.sm },
  recheck: { alignItems: 'center', paddingTop: spacing.md, minHeight: 32 },
  recheckText: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
  reason: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink, marginTop: spacing.sm },
  flash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  flashText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});
