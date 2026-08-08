import type { ComponentProps } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ScanView } from '../navigation';
import { colors, spacing, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, IconBubble, Label } from '../components';

type FeatherName = ComponentProps<typeof Feather>['name'];

const GUIDE: Record<ScanView, { icon: FeatherName; text: string }[]> = {
  side: [
    { icon: 'smartphone', text: 'Place your phone at waist height, 2–3 m away.' },
    { icon: 'user', text: 'Stand side-on with your whole body in frame.' },
    { icon: 'sun', text: 'Use good, even lighting — avoid backlight.' },
    { icon: 'activity', text: 'Walk or run naturally for several strides.' },
  ],
  // Web-internal: no route ever opens this screen with view:'rear' — the web
  // scan runs its rear pass in-screen and renders these steps inline via the
  // REAR_GUIDE_STEPS export below. Native has no rear pass at all.
  rear: [
    { icon: 'smartphone', text: 'Place your phone at waist height, 2–3 m behind you.' },
    { icon: 'user', text: 'Face away from the camera, whole body in frame.' },
    { icon: 'sun', text: 'Use good, even lighting — avoid backlight.' },
    { icon: 'activity', text: 'Walk straight away from the camera for several strides.' },
  ],
};

/** Rear-view positioning steps, shared with PoseScanScreen.web's in-screen rear pass. */
export const REAR_GUIDE_STEPS: string[] = GUIDE.rear.map((g) => g.text);

// Only the web scan offers the second (rear) angle, so only web copy may
// promise it — native gets side-view-only framing.
const isWeb = Platform.OS === 'web';

const COPY: Record<ScanView, { step: string; title: string; sub: string; button: string }> = {
  side: isWeb
    ? {
        step: 'View 1 of 2 · Side',
        title: 'Set up your side view',
        sub: 'A clean side-on view gives cadence and your main form read.',
        button: 'Start side recording',
      }
    : {
        step: 'Side view',
        title: 'Set up your side view',
        sub: 'A clean side-on view gives cadence and your main form read.',
        button: 'Start recording',
      },
  rear: {
    step: 'View 2 of 2 · Rear',
    title: 'Now the rear view',
    sub: 'A view from behind adds hip level, base of support and left/right balance — folded into the same result.',
    button: 'Start rear recording',
  },
};

type Props = NativeStackScreenProps<RootStackParamList, 'CameraGuide'>;

export default function CameraGuideScreen({ navigation, route }: Props) {
  const { goal, sideFrames } = route.params;
  const view: ScanView = route.params.view ?? 'side';
  const guide = GUIDE[view];
  const copy = COPY[view];

  return (
    <ScreenContainer
      title="Camera guide"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={copy.button}
          icon="camera"
          onPress={() => navigation.navigate('PoseScan', { goal, view, sideFrames })}
        />
      }
    >
      <Label>{copy.step}</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>{copy.title}</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>{copy.sub}</Text>

      {guide.map((g, i) => (
        <View key={i} style={styles.row}>
          <IconBubble icon={g.icon} tint={colors.surfaceAlt} color={colors.ink} size={42} />
          <Text style={styles.text}>{g.text}</Text>
        </View>
      ))}

      <Card style={styles.demo}>
        <View style={styles.demoHead}>
          <Feather name="info" size={16} color={colors.muted} />
          <Text style={styles.demoTitle}>
            {view === 'rear' ? 'Optional — for a fuller read' : isWeb ? 'Two quick angles' : 'Before you record'}
          </Text>
        </View>
        <Text style={styles.demoText}>
          {view === 'rear'
            ? 'This second angle is optional. Skip it any time and we’ll analyze your side view on its own.'
            : isWeb
              ? 'First a side view for cadence and form, then an optional rear view. Both fold into one result. By default no video is saved — you can opt to keep a clip for your review only, then it’s deleted; nothing is uploaded.'
              : 'By default no video is saved — you can opt to keep a clip for your review only, then it’s deleted; nothing is uploaded.'}
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  text: { flex: 1, marginLeft: spacing.lg, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.ink },
  demo: { marginTop: spacing.md, backgroundColor: colors.surfaceAlt, borderColor: colors.line },
  demoHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  demoTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  demoText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: spacing.sm },
});
