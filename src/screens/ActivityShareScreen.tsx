import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Chip, Label } from '../components';
import { buildActivityStickerSvg, SHARE_SIZE, type ShareBackground, type ShareFormat } from '../share/activitySticker';
import { exportSticker } from '../share/exportSticker';
import { getActivity, getTrack } from '../storage/activities';
import { SPORT_LABEL } from '../activity/format';
import type { ActivitySummary, ActivityTrack } from '../activity/types';

type Props = RootScreenProps<'ActivityShare'>;

/**
 * Strava-style share image for an activity: route + distance/pace/time + the
 * Kasya logo. Square (feed) or Story (9:16), as a solid card or a transparent
 * sticker to put over your own photo. Same SVG drives preview and export.
 */
export default function ActivityShareScreen({ navigation, route }: Props) {
  const { id } = route.params;
  const { width, height: screenH } = useWindowDimensions();
  const [a, setA] = useState<ActivitySummary | null>(null);
  const [track, setTrack] = useState<ActivityTrack | null>(null);
  const [bg, setBg] = useState<ShareBackground>('brand');
  const [format, setFormat] = useState<ShareFormat>('square');
  // on by default: a route that starts at your door shouldn't be posted as-is
  const [hideEnds, setHideEnds] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const shotRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const s = await getActivity(id);
        const t = s?.hasTrack ? await getTrack(id) : null;
        if (!alive) return;
        setA(s);
        setTrack(t);
      })();
      return () => {
        alive = false;
      };
    }, [id]),
  );

  const svg = useMemo(
    () => (a ? buildActivityStickerSvg(a, track, { background: bg, format, hideEndsM: hideEnds ? 200 : 0 }) : ''),
    [a, track, bg, format, hideEnds],
  );
  const size = SHARE_SIZE[format];
  // Fit the preview on screen: full width for square, height-capped for story.
  const maxW = Math.min(width - spacing.xl * 2, 420);
  const maxH = Math.max(320, screenH * 0.58);
  const previewW = Math.min(maxW, (maxH * size.w) / size.h);
  const previewH = (previewW * size.h) / size.w;

  const share = async () => {
    if (!a) return;
    setBusy(true);
    setNote('');
    try {
      await exportSticker(svg, shotRef.current, {
        width: size.w,
        height: size.h,
        fileName: `kasya-${a.sport}-${a.startedAt.slice(0, 10)}.png`,
        title: `My Kasya ${SPORT_LABEL[a.sport].toLowerCase()}`,
      });
      setNote('Image ready — post it anywhere.');
    } catch {
      setNote('Sharing didn’t work on this device — try again or take a screenshot.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer
      title="Share activity"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={busy ? 'Preparing…' : 'Share / save image'}
          icon="share-2"
          variant="accent"
          onPress={share}
          loading={busy}
          disabled={!a}
        />
      }
    >
      <Label>Post your {a ? SPORT_LABEL[a.sport].toLowerCase() : 'activity'}</Label>
      <View style={[styles.chipRow, { marginTop: spacing.md }]}>
        <Chip label="Square" icon="square" selected={format === 'square'} onPress={() => setFormat('square')} />
        <Chip label="Story" icon="smartphone" selected={format === 'story'} onPress={() => setFormat('story')} />
      </View>
      <View style={styles.chipRow}>
        <Chip label="With background" selected={bg === 'brand'} onPress={() => setBg('brand')} />
        <Chip label="Transparent" selected={bg === 'transparent'} onPress={() => setBg('transparent')} />
      </View>
      <View style={styles.chipRow}>
        <Chip
          label="Hide start & end"
          icon={hideEnds ? 'eye-off' : 'eye'}
          selected={hideEnds}
          onPress={() => setHideEnds((v) => !v)}
        />
      </View>

      {a ? (
        <View style={[styles.previewFrame, { width: previewW, height: previewH }]}>
          {bg === 'transparent' && (
            <LinearGradient
              colors={['#7A8AA0', '#3E4A5C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {/* Only this wrapper is snapshotted on native — the sample backdrop above is never exported. */}
          <View ref={shotRef} collapsable={false} style={styles.shot}>
            <SvgXml xml={svg} width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} />
          </View>
        </View>
      ) : (
        <View style={[styles.previewFrame, { width: previewW, height: previewH }]} />
      )}
      {bg === 'transparent' && (
        <Text style={styles.previewNote}>
          Shown over a sample photo — the exported image keeps the background fully transparent.
        </Text>
      )}

      <Text style={styles.small}>
        The image shows your route's shape and your numbers — no map, street names or coordinates.{' '}
        {hideEnds
          ? 'The first and last 200 m are hidden, so it doesn’t show where you started or finished.'
          : 'Start and finish are visible — think twice before posting a loop that starts at your door.'}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  previewFrame: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  shot: { flex: 1, backgroundColor: 'transparent' },
  previewNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  small: { ...T.small, marginTop: spacing.lg },
  note: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentInk, marginTop: spacing.md },
});
