import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line, Rect } from 'react-native-svg';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { Card, Button } from '../components';
import {
  DEFAULT_GOALS,
  GOAL_LIMITS,
  dailyScore,
  goalMet,
  goalStreak,
  hrZone,
  periodDays,
  scoreLabel,
  summarize,
  weekStrip,
  type DayMetrics,
  type Goals,
  type Period,
} from './daily';
import { loadDaily, loadHeartRate, type DailyLoad, type HeartRateToday } from './dailyData';
import { getGoals, onGoals, setGoals } from './goals';
import { localDayKey } from './days';
import { HEALTH_NAME } from './health';

/**
 * The Activity tab's daily dashboard: this week's goal days, the daily score
 * ring with calories / steps / active minutes, Day–Week–Month totals and
 * today's heart rate. Kasya orange throughout; every number says where it came
 * from (Apple Health, this iPhone's estimate, or web sample data).
 */

const AMBER = '#FFA24C';
type Metric = 'steps' | 'kcal' | 'activeMin';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

export function StepsDashboard({
  refreshKey,
  onConnectHealth,
  footer,
}: {
  /** bump to reload (the tab regained focus) */
  refreshKey: number;
  /** shown on the heart-rate card when Health isn't connected */
  onConnectHealth?: () => void;
  footer?: React.ReactNode;
}) {
  const [load, setLoad] = useState<DailyLoad | null>(null);
  const [hr, setHr] = useState<HeartRateToday | null | undefined>(undefined);
  const [goals, setGoalsState] = useState<Goals>(DEFAULT_GOALS);
  const [period, setPeriod] = useState<Period>('day');
  const [metric, setMetric] = useState<Metric>('steps');
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    getGoals().then((g) => alive && setGoalsState(g));
    const off = onGoals((g) => setGoalsState(g));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setNow(new Date());
    loadDaily()
      .then((l) => alive && setLoad(l))
      .catch(() => alive && setLoad({ byDay: new Map(), source: 'none' }));
    loadHeartRate()
      .then((h) => alive && setHr(h))
      .catch(() => alive && setHr(null));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const byDay = load?.byDay ?? new Map<string, DayMetrics>();
  const summary = useMemo(() => summarize(byDay, period, now, goals), [byDay, period, now, goals]);
  const strip = useMemo(() => weekStrip(byDay, now, goals), [byDay, now, goals]);
  const streak = useMemo(() => goalStreak(byDay, now, goals), [byDay, now, goals]);

  const sourceNote =
    load?.source === 'health'
      ? `From ${HEALTH_NAME}${summary.estimated ? ' · some calories / active minutes estimated from steps' : ''}`
      : load?.source === 'phone'
        ? 'Steps from this iPhone · calories and active minutes are estimates'
        : load?.source === 'demo'
          ? 'Sample data — your own numbers show in the Kasya iPhone app'
          : load
            ? 'Connect Apple Health or allow Motion & Fitness to track your steps'
            : 'Loading…';

  return (
    <View>
      <WeekStrip strip={strip} goals={goals} streak={streak} />

      <View style={styles.sectionHead}>
        <Text style={T.label}>Daily activity</Text>
        <View style={styles.segment} accessibilityRole="tablist">
          {PERIODS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === p.key }}
              style={[styles.segBtn, period === p.key && styles.segOn]}
              hitSlop={4}
            >
              <Text style={[styles.segText, period === p.key && styles.segTextOn]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <ScoreCard
          score={summary.score}
          stepsPct={summary.goalSteps ? summary.steps / summary.goalSteps : 0}
          period={period}
          onEditGoals={() => setEditing(true)}
        />
        <View style={styles.stats}>
          <StatRow
            icon="fire"
            label="Calories"
            value={summary.kcal}
            goal={summary.goalKcal}
            unit="kcal"
            selected={metric === 'kcal'}
            onPress={() => setMetric('kcal')}
          />
          <View style={styles.hair} />
          <StatRow
            icon="shoe-print"
            label="Steps"
            value={summary.steps}
            goal={summary.goalSteps}
            selected={metric === 'steps'}
            onPress={() => setMetric('steps')}
          />
          <View style={styles.hair} />
          <StatRow
            icon="timer-outline"
            label="Active"
            value={summary.activeMin}
            goal={summary.goalActiveMin}
            unit="min"
            selected={metric === 'activeMin'}
            onPress={() => setMetric('activeMin')}
          />
        </View>
      </View>

      <TrendCard byDay={byDay} period={period} now={now} goals={goals} metric={metric} summary={summary} />
      <Text style={[T.small, styles.source]}>{sourceNote}</Text>

      <HeartRateCard hr={hr} age={goals.age ?? null} onConnect={onConnectHealth} onAddAge={() => setEditing(true)} />

      {footer}

      <GoalsSheet visible={editing} goals={goals} onClose={() => setEditing(false)} />
    </View>
  );
}

// ---- week strip ---------------------------------------------------------------

const WeekStrip = memo(function WeekStrip({
  strip,
  goals,
  streak,
}: {
  strip: ReturnType<typeof weekStrip>;
  goals: Goals;
  streak: number;
}) {
  const met = strip.filter((d) => d.met).length;
  return (
    <Card style={styles.stripCard}>
      <View style={styles.stripHead}>
        <Text style={T.title}>This week</Text>
        <View style={styles.streak}>
          <Feather name="zap" size={13} color={colors.accent} />
          <Text style={styles.streakText}>
            {streak > 0 ? `${streak}-day streak` : `${met} of 7 goal days`}
          </Text>
        </View>
      </View>
      <View style={styles.stripRow}>
        {strip.map((d) => (
          <View
            key={d.day}
            style={styles.stripDay}
            accessible
            accessibilityLabel={`${d.day}: ${d.met ? `goal of ${goals.steps.toLocaleString()} steps reached` : d.isFuture ? 'upcoming' : 'goal not reached'}`}
          >
            <Text style={[styles.stripLetter, d.isToday && { color: colors.ink }]}>{d.letter}</Text>
            <View
              style={[
                styles.stripDot,
                d.met && styles.stripMet,
                !d.met && d.isToday && styles.stripToday,
                d.isFuture && { opacity: 0.4 },
              ]}
            >
              {d.met ? (
                <Feather name="check" size={16} color={colors.onDark} />
              ) : (
                <Text style={[styles.stripDate, d.isToday && { color: colors.ink }]}>{d.date}</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
});

// ---- score ring -------------------------------------------------------------

function arcPath(cx: number, cy: number, r: number, frac: number): string {
  const f = Math.max(0, Math.min(0.9999, frac));
  const a0 = -Math.PI / 2;
  const a1 = a0 + f * Math.PI * 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
}

const ScoreCard = memo(function ScoreCard({
  score,
  stepsPct,
  period,
  onEditGoals,
}: {
  score: number;
  stepsPct: number;
  period: Period;
  onEditGoals: () => void;
}) {
  const size = 132;
  const c = size / 2;
  const outer = 58;
  const inner = 45;
  const { label } = scoreLabel(score);
  return (
    <Card style={styles.scoreCard}>
      <View style={styles.scoreHead}>
        <Text style={styles.cardTitle}>{period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</Text>
        <Pressable onPress={onEditGoals} accessibilityRole="button" accessibilityLabel="Edit your daily goals" hitSlop={10}>
          <Feather name="sliders" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="ringA" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={AMBER} />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
            <LinearGradient id="ringB" x1="1" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accentInk} />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
          </Defs>
          <Circle cx={c} cy={c} r={outer} stroke={colors.surfaceAlt} strokeWidth={11} fill="none" />
          <Circle cx={c} cy={c} r={inner} stroke={colors.surfaceAlt} strokeWidth={7} fill="none" />
          {score > 0 ? (
            <Path d={arcPath(c, c, outer, score / 1000)} stroke="url(#ringA)" strokeWidth={11} strokeLinecap="round" fill="none" />
          ) : null}
          {stepsPct > 0 ? (
            <Path d={arcPath(c, c, inner, Math.min(1, stepsPct))} stroke="url(#ringB)" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.85} />
          ) : null}
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.ringCaption}>{period === 'day' ? 'Total score' : 'Avg score'}</Text>
          <Text style={styles.ringScore} accessibilityLabel={`Score ${score} of 1000, ${label}`}>
            {score}
          </Text>
          <Text style={styles.ringOf}>of 1,000</Text>
        </View>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{label}</Text>
        <Feather name="zap" size={11} color={colors.accent} />
      </View>
    </Card>
  );
});

// ---- stat rows ----------------------------------------------------------------

const StatRow = memo(function StatRow({
  icon,
  label,
  value,
  goal,
  unit,
  selected,
  onPress,
}: {
  icon: 'fire' | 'shoe-print' | 'timer-outline';
  label: string;
  value: number;
  goal: number;
  unit?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${value.toLocaleString()} of ${goal.toLocaleString()}${unit ? ` ${unit}` : ''}. Show chart`}
      style={({ pressed }) => [styles.stat, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.statIcon, selected && { borderColor: colors.accent }]}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value.toLocaleString()}
        </Text>
        <Text style={styles.statGoal} numberOfLines={1}>
          / {goal.toLocaleString()}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>
      <Feather name="chevron-right" size={14} color={selected ? colors.accent : colors.lineStrong} />
    </Pressable>
  );
});

// ---- trend bars -----------------------------------------------------------------

const METRIC_LABEL: Record<Metric, string> = { steps: 'Steps', kcal: 'Calories', activeMin: 'Active minutes' };
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function TrendCard({
  byDay,
  period,
  now,
  goals,
  metric,
  summary,
}: {
  byDay: Map<string, DayMetrics>;
  period: Period;
  now: Date;
  goals: Goals;
  metric: Metric;
  summary: ReturnType<typeof summarize>;
}) {
  const [chartW, setChartW] = useState(0);
  const today = localDayKey(now);
  // Today shows the last 7 days for context; week and month show their own days.
  const keys =
    period === 'day'
      ? Array.from({ length: 7 }, (_, i) => localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)))
      : periodDays(period, now);
  const value = (k: string) => {
    const d = byDay.get(k);
    return d ? d[metric] : 0;
  };
  const goal = goals[metric];
  const max = Math.max(goal * 1.15, ...keys.map(value), 1);
  const chartH = 96;
  const gap = keys.length > 10 ? 2 : 8;
  const barW = Math.max(3, (chartW - gap * (keys.length - 1)) / keys.length);
  const goalY = chartH - (goal / max) * chartH;
  const elapsed = summary.elapsed || 1;
  const total = keys.filter((k) => k <= today).reduce((s, k) => s + value(k), 0);
  const unit = metric === 'kcal' ? ' kcal' : metric === 'activeMin' ? ' min' : '';
  return (
    <Card style={{ marginTop: spacing.md }}>
      <View style={styles.trendHead}>
        <Text style={T.title}>{METRIC_LABEL[metric]}</Text>
        <Text style={T.small}>{period === 'day' ? 'Last 7 days' : period === 'week' ? 'This week' : 'This month'}</Text>
      </View>
      <View style={{ marginTop: spacing.md }} onLayout={(e) => setChartW(Math.floor(e.nativeEvent.layout.width))}>
      {chartW > 0 ? (
      <Svg width={chartW} height={chartH + 4}>
        <Line x1={0} x2={chartW} y1={goalY} y2={goalY} stroke={colors.accent} strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
        {keys.map((k, i) => {
          const v = value(k);
          const h = v > 0 ? Math.max(3, (v / max) * chartH) : 0;
          const future = k > today;
          const met = metric === 'steps' ? goalMet(byDay.get(k), goals) : v >= goal;
          return (
            <Rect
              key={k}
              x={i * (barW + gap)}
              y={chartH - h}
              width={barW}
              height={future ? 0 : Math.max(h, 2)}
              rx={Math.min(4, barW / 2)}
              fill={met ? colors.accent : k === today ? colors.accentInk : colors.lineStrong}
              opacity={future ? 0.3 : 1}
            />
          );
        })}
      </Svg>
      ) : <View style={{ height: chartH + 4 }} />}
      </View>
      {keys.length <= 7 ? (
        <View style={styles.trendLabels}>
          {keys.map((k) => (
            <Text key={k} style={[styles.trendLbl, { width: barW + gap }, k === today && { color: colors.ink }]}>
              {WEEK_LETTERS[(new Date(k + 'T12:00:00').getDay() + 6) % 7]}
            </Text>
          ))}
        </View>
      ) : null}
      {period === 'month' ? <MonthCalendar byDay={byDay} now={now} goals={goals} /> : null}
      <View style={styles.trendFoot}>
        <FootStat label="Total" value={`${total.toLocaleString()}${unit}`} />
        <FootStat label="Daily avg" value={`${Math.round(total / (period === 'day' ? 7 : elapsed)).toLocaleString()}${unit}`} />
        <FootStat label="Goal days" value={`${period === 'day' ? keys.filter((k) => goalMet(byDay.get(k), goals)).length : summary.daysMet} / ${period === 'day' ? 7 : elapsed}`} />
      </View>
    </Card>
  );
}

/** The month as a calendar, Monday first; goal days filled orange. */
function MonthCalendar({ byDay, now, goals }: { byDay: Map<string, DayMetrics>; now: Date; goals: Goals }) {
  const today = localDayKey(now);
  const days = periodDays('month', now);
  const lead = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  return (
    <View style={styles.cal} accessibilityLabel="Goal days this month">
      <View style={styles.calRow}>
        {WEEK_LETTERS.map((l, i) => (
          <Text key={i} style={styles.calHead}>
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((wk, w) => (
        <View key={w} style={styles.calRow}>
          {wk.map((k, i) => {
            if (!k) return <View key={i} style={styles.calCell} />;
            const met = k <= today && goalMet(byDay.get(k), goals);
            const isToday = k === today;
            return (
              <View key={k} style={styles.calCell}>
                <View style={[styles.calDot, met && styles.stripMet, !met && isToday && styles.stripToday, k > today && { opacity: 0.35 }]}>
                  <Text style={[styles.calDate, met && { color: colors.onDark }, isToday && { color: colors.ink }]}>{Number(k.slice(8))}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.footVal} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.footLbl}>{label}</Text>
    </View>
  );
}

// ---- heart rate -------------------------------------------------------------------

function HeartRateCard({
  hr,
  age,
  onConnect,
  onAddAge,
}: {
  hr: HeartRateToday | null | undefined;
  age: number | null;
  onConnect?: () => void;
  onAddAge: () => void;
}) {
  const [chartW, setChartW] = useState(0);
  const chartH = 84;
  if (hr === undefined) return null;
  if (!hr || !hr.points.length) {
    return (
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.hrHead}>
          <MaterialCommunityIcons name="heart-pulse" size={18} color={colors.danger} />
          <Text style={[T.title, { marginLeft: spacing.sm }]}>Heart rate</Text>
        </View>
        <Text style={[T.small, { marginTop: spacing.xs }]}>
          {hr ? 'No heart-rate readings today yet — wear your watch and it shows up here.' : 'See your heart rate through the day from your watch, through Apple Health.'}
        </Text>
        {!hr && onConnect ? <Button label={`Connect ${HEALTH_NAME}`} icon="heart" variant="secondary" onPress={onConnect} /> : null}
      </Card>
    );
  }
  const latest = hr.latest!;
  const fresh = Date.now() - latest.t < 10 * 60_000;
  const zone = hrZone(latest.bpm, age);
  const lo = 40;
  const hi = Math.max(180, (hr.max ?? 0) + 10);
  const day0 = new Date(latest.t);
  const start = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate()).getTime();
  const axisW = 28;
  const plotW = Math.max(0, chartW - axisW);
  const x = (t: number) => ((t - start) / 86400_000) * plotW;
  const y = (b: number) => chartH - ((b - lo) / (hi - lo)) * chartH;
  const d = hr.points.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${y(p.bpm).toFixed(1)}`).join(' ');
  const area = `${d} L ${x(latest.t).toFixed(1)} ${chartH} L ${x(hr.points[0].t).toFixed(1)} ${chartH} Z`;
  const time = new Date(latest.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Card style={{ marginTop: spacing.md }}>
      <View style={styles.hrHead}>
        <MaterialCommunityIcons name="heart-pulse" size={18} color={colors.danger} />
        <Text style={[T.title, { marginLeft: spacing.sm, flex: 1 }]}>Heart rate</Text>
        <View style={styles.livePill}>
          <View style={[styles.liveDot, !fresh && { backgroundColor: colors.muted }]} />
          <Text style={styles.liveText}>{hr.demo ? 'Sample' : fresh ? 'Live' : `Latest ${time}`}</Text>
        </View>
      </View>
      <View style={styles.hrTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hrBpm}>
            {latest.bpm}
            <Text style={styles.hrUnit}> BPM</Text>
          </Text>
          {zone ? (
            <Text style={styles.hrZone}>
              Zone {zone.zone} · {zone.name}
            </Text>
          ) : age ? (
            <Text style={styles.hrZone}>Below zone 1 · at rest</Text>
          ) : (
            <Pressable onPress={onAddAge} accessibilityRole="button" hitSlop={6}>
              <Text style={[styles.hrZone, { color: colors.accentInk }]}>Add your age for zones</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.hrStats}>
          {hr.resting ? <HrStat label="Resting" value={hr.resting} /> : null}
          <HrStat label="Avg" value={hr.avg} />
          <HrStat label="Max" value={hr.max} />
        </View>
      </View>
      <View style={{ marginTop: spacing.md }} onLayout={(e) => setChartW(Math.floor(e.nativeEvent.layout.width))}>
        {chartW > 0 ? (
          <Svg width={chartW} height={chartH + 6}>
            <Defs>
              <LinearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[60, 120, 180].map((b) => (
              <Line key={b} x1={0} x2={plotW} y1={y(b)} y2={y(b)} stroke={colors.line} strokeWidth={1} />
            ))}
            <Path d={area} fill="url(#hrFill)" />
            <Path d={d} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Circle cx={x(latest.t)} cy={y(latest.bpm)} r={4} fill={colors.accent} stroke={colors.onDark} strokeWidth={1.5} />
          </Svg>
        ) : (
          <View style={{ height: chartH + 6 }} />
        )}
        {chartW > 0
          ? [60, 120, 180].map((b) => (
              <Text key={b} style={[styles.hrY, { top: y(b) - 7, left: plotW + 6 }]}>
                {b}
              </Text>
            ))
          : null}
      </View>
      <View style={[styles.hrAxis, { width: plotW }]}>
        {['00:00', '06:00', '12:00', '18:00', '24:00'].map((l) => (
          <Text key={l} style={styles.trendLbl}>
            {l}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function HrStat({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.hrStatVal}>{value ?? '–'}</Text>
      <Text style={styles.hrStatLbl}>{label}</Text>
    </View>
  );
}

// ---- goals sheet ---------------------------------------------------------------------

function GoalsSheet({ visible, goals, onClose }: { visible: boolean; goals: Goals; onClose: () => void }) {
  const [draft, setDraft] = useState<Goals>(goals);
  useEffect(() => {
    if (visible) setDraft(goals);
  }, [visible, goals]);
  const step = useCallback(
    (k: keyof typeof GOAL_LIMITS, dir: 1 | -1) =>
      setDraft((g) => {
        const [lo, hi, s] = GOAL_LIMITS[k];
        const cur = (k === 'age' ? (g.age ?? 30) : g[k]) as number;
        return { ...g, [k]: Math.min(hi, Math.max(lo, cur + dir * s)) };
      }),
    [],
  );
  const save = async () => {
    await setGoals(draft);
    onClose();
  };
  const preview = dailyScore({ steps: draft.steps, activeMin: draft.activeMin, kcal: draft.kcal }, draft);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close goals" />
      <View style={styles.sheet}>
        <Text style={T.h2}>Daily goals</Text>
        <Text style={[T.small, { marginTop: 2 }]}>
          Your score is out of 1,000: steps count for half, active minutes 30%, calories 20%. Meeting all three = {preview.toLocaleString()}.
        </Text>
        <Stepper label="Steps" value={draft.steps.toLocaleString()} onMinus={() => step('steps', -1)} onPlus={() => step('steps', 1)} />
        <Stepper label="Active minutes" value={`${draft.activeMin} min`} onMinus={() => step('activeMin', -1)} onPlus={() => step('activeMin', 1)} />
        <Stepper label="Active calories" value={`${draft.kcal.toLocaleString()} kcal`} onMinus={() => step('kcal', -1)} onPlus={() => step('kcal', 1)} />
        <Stepper
          label="Age (for heart-rate zones)"
          value={draft.age ? String(draft.age) : 'Not set'}
          onMinus={() => step('age', -1)}
          onPlus={() => step('age', 1)}
        />
        <View style={{ height: spacing.lg }} />
        <Button label="Save goals" variant="primary" onPress={save} />
      </View>
    </Modal>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={[T.body, { flex: 1, color: colors.ink }]}>{label}</Text>
      <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel={`Lower ${label}`} style={styles.stepBtn} hitSlop={6}>
        <Feather name="minus" size={18} color={colors.ink} />
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel={`Raise ${label}`} style={styles.stepBtn} hitSlop={6}>
        <Feather name="plus" size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stripCard: { paddingVertical: spacing.md },
  stripHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  streakText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentInk },
  stripRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  stripDay: { alignItems: 'center', gap: 6, flex: 1 },
  stripLetter: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  stripDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  stripMet: { backgroundColor: colors.accent, borderColor: colors.accent },
  stripToday: { borderColor: colors.accent },
  stripDate: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.line },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, minHeight: 30, justifyContent: 'center' },
  segOn: { backgroundColor: colors.accent },
  segText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  segTextOn: { color: colors.onDark },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  scoreCard: { flex: 1, alignItems: 'stretch', paddingHorizontal: spacing.md },
  scoreHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringCaption: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  ringScore: { fontFamily: fonts.extra, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: -0.5 },
  ringOf: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: '#5A2610',
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentInk },
  stats: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.sm + 2, justifyContent: 'space-around' },
  hair: { height: 1, backgroundColor: colors.line },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm, minHeight: 44 },
  statIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkSoft },
  statValue: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: colors.accent },
  statGoal: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  trendHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  trendLabels: { flexDirection: 'row', marginTop: 2 },
  trendLbl: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, textAlign: 'center' },
  trendFoot: { flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.sm },
  cal: { marginTop: spacing.lg, gap: 6 },
  calRow: { flexDirection: 'row' },
  calHead: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 11, color: colors.muted },
  calCell: { flex: 1, alignItems: 'center' },
  calDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
  calDate: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  footVal: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  footLbl: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 1 },
  source: { marginTop: spacing.sm },
  hrHead: { flexDirection: 'row', alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  liveText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
  hrTop: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md, gap: spacing.md },
  hrStats: { flexDirection: 'row', gap: spacing.lg },
  hrStatVal: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  hrStatLbl: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  hrY: { position: 'absolute', fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  hrBpm: { fontFamily: fonts.extra, fontSize: 34, lineHeight: 40, color: colors.ink },
  hrUnit: { fontFamily: fonts.bold, fontSize: 13, color: colors.accent },
  hrZone: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  hrAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xxxl, borderWidth: 1, borderColor: colors.line },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, minWidth: 92, textAlign: 'center' },
});
