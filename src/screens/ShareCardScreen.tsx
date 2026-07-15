import { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Chip, Label } from '../components';
import { buildResultStickerSvg, STICKER_SIZE } from '../share/resultSticker';
import { exportSticker } from '../share/exportSticker';

type Props = RootScreenProps<'Share'>;
type Bg = 'brand' | 'transparent';

export default function ShareCardScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const { width } = useWindowDimensions();
  const [bg, setBg] = useState<Bg>('brand');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const shotRef = useRef<View>(null);

  const svg = useMemo(() => buildResultStickerSvg(report, { background: bg }), [report, bg]);
  const previewSize = Math.min(width - spacing.xl * 2, 420);

  const share = async () => {
    setBusy(true);
    setNote('');
    try {
      await exportSticker(svg, shotRef.current);
      setNote('Image ready — post it anywhere.');
    } catch {
      setNote('Sharing didn’t work on this device — try again or take a screenshot.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer
      title="Share your result"
      onBack={() => navigation.goBack()}
      footer={<Button label={busy ? 'Preparing…' : 'Share / save image'} icon="share-2" variant="accent" onPress={share} loading={busy} />}
    >
      <Label>Strava-style sticker</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>Post your stride</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
        A clean card of your scan numbers with the Kasya mark — pick a solid card, or a transparent sticker to lay
        over your own photo or video.
      </Text>

      <View style={[styles.chipRow, { marginTop: spacing.lg }]}>
        <Chip label="With background" selected={bg === 'brand'} onPress={() => setBg('brand')} />
        <Chip label="Transparent" selected={bg === 'transparent'} onPress={() => setBg('transparent')} />
      </View>

      <View style={[styles.previewFrame, { width: previewSize, height: previewSize }]}>
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
          <SvgXml xml={svg} width="100%" height="100%" viewBox={`0 0 ${STICKER_SIZE} ${STICKER_SIZE}`} />
        </View>
      </View>
      {bg === 'transparent' && (
        <Text style={styles.previewNote}>
          Shown over a sample photo — the exported image keeps the background fully transparent.
        </Text>
      )}

      <Text style={styles.small}>
        The image holds only the numbers you see — no name, no location, no photo of you.
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
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: spacing.lg },
  note: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentInk, marginTop: spacing.md },
});
