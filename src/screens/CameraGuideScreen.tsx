import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, IconBubble, Label } from '../components';

const GUIDE = [
  { icon: 'smartphone', text: 'Place your phone at waist height, 2–3 m away.' },
  { icon: 'user', text: 'Stand side-on with your whole body in frame.' },
  { icon: 'sun', text: 'Use good, even lighting — avoid backlight.' },
  { icon: 'activity', text: 'Walk or run naturally for several strides.' },
] as const;

type Props = NativeStackScreenProps<RootStackParamList, 'CameraGuide'>;

export default function CameraGuideScreen({ navigation, route }: Props) {
  const { goal } = route.params;

  return (
    <ScreenContainer
      title="Camera guide"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label="Start recording"
          icon="camera"
          onPress={() => navigation.navigate('PoseScan', { goal })}
        />
      }
    >
      <Label>Step 2 of 2</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>Set up your shot</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        A clean side-on view gives the most reliable reading.
      </Text>

      {GUIDE.map((g, i) => (
        <View key={i} style={styles.row}>
          <IconBubble icon={g.icon} tint={colors.surfaceAlt} color={colors.ink} size={42} />
          <Text style={styles.text}>{g.text}</Text>
        </View>
      ))}

      <Card style={styles.demo}>
        <View style={styles.demoHead}>
          <Feather name="info" size={16} color={colors.muted} />
          <Text style={styles.demoTitle}>Demo mode</Text>
        </View>
        <Text style={styles.demoText}>
          In the StrideFit app build, this uses your camera to track your stride live — no video
          ever leaves your phone. In Expo Go or the browser it runs a quick simulation.
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
