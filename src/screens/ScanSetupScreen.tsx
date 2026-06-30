import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { spacing, type as T } from '../theme';
import { ScreenContainer, Button, Chip, Label } from '../components';

const GOALS = [
  { key: 'running', label: 'Running', icon: 'activity' },
  { key: 'walking', label: 'Walking', icon: 'navigation' },
  { key: 'gym', label: 'Gym / training', icon: 'zap' },
  { key: 'daily_comfort', label: 'Daily comfort', icon: 'sun' },
  { key: 'recovery', label: 'Recovery', icon: 'heart' },
] as const;

type Props = NativeStackScreenProps<RootStackParamList, 'ScanSetup'>;

export default function ScanSetupScreen({ navigation }: Props) {
  const [goal, setGoal] = useState('running');

  return (
    <ScreenContainer
      title="New scan"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label="Continue"
          iconRight="arrow-right"
          onPress={() => navigation.navigate('CameraGuide', { goal })}
        />
      }
    >
      <Label>Step 1 of 2</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>What are you training for?</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        We tailor your shoe matches to this goal.
      </Text>

      <View style={styles.chips}>
        {GOALS.map((g) => (
          <Chip
            key={g.key}
            label={g.label}
            icon={g.icon}
            selected={goal === g.key}
            onPress={() => setGoal(g.key)}
          />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
