import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, type as T } from '../theme';
import { ScreenContainer, Button, IconBubble, Disclaimer } from '../components';

/**
 * Web / Expo Go fallback for the gait scan.
 *
 * Real on-device camera + skeleton tracking lives in PoseScanScreen.native.tsx,
 * which Metro only bundles for native (and which only runs in the custom dev
 * build). Here we explain that and offer a simulated run so the full flow works
 * anywhere.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'PoseScan'>;

export default function PoseScanScreen({ navigation, route }: Props) {
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
        Real on-device camera tracking — the skeleton drawn on your legs and feet — runs in the
        StrideFit development build, not in Expo Go or the browser. Run a simulated scan here to see
        the full flow end to end.
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
