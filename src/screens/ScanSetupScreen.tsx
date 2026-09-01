import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { spacing, type as T } from '../theme';
import { ScreenContainer, Button, Chip, Label } from '../components';

import { GOALS } from '../goals';

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
          onPress={() => navigation.navigate('CameraGuide', { goal, view: 'side' })}
        />
      }
    >
      <Label>Step 1 of 2 · Your goal</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>What will you mostly use your shoes for?</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        We tailor your shoe matches to this goal. Next: a quick 30-second camera scan of how you
        walk or run — no video is saved.
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
