import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, type as T } from '../theme';
import { ScreenContainer, Button, IconBubble, Disclaimer } from '../components';

/**
 * Simulated-scan fallback, used when real pose can't run here:
 * - Expo Go (real camera needs the dev build), and
 * - any platform without a more specific PoseScanScreen.<platform> file.
 * Web uses PoseScanScreen.web.tsx (real webcam analysis) instead.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'PoseScan'>;

export default function SimulatedScanScreen({ navigation, route }: Props) {
  const { goal } = route.params;

  return (
    <ScreenContainer
      title="Gait scan"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label="Run a simulated scan"
          icon="play"
          onPress={() => navigation.replace('Processing', { goal })}
        />
      }
    >
      <View style={styles.center}>
        <IconBubble icon="camera-off" tint={colors.surfaceAlt} color={colors.ink} size={72} />
      </View>
      <Text style={[T.h1, styles.h]}>Live tracking runs in the app build</Text>
      <Text style={[T.bodyMuted, styles.p]}>
        Real camera tracking with the skeleton on your legs and feet runs in the browser (open
        StrideFit on the web) or the StrideFit development build — not in Expo Go. Run a simulated
        scan here to see the full flow.
      </Text>
      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: spacing.xxl },
  h: { textAlign: 'center', marginTop: spacing.xl },
  p: { textAlign: 'center', marginTop: spacing.sm },
});
