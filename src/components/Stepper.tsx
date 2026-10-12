import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { C } from '../theme';

interface Props {
  label: string;
  value: number;
  unit?: string;
  onChange: (delta: number) => void;
  step?: number;
}

export default function Stepper({ label, value, unit = 'm', onChange, step = 0.1 }: Props) {
  const btn = {
    width: 36, height: 36, borderRadius: 8, backgroundColor: C.surfaceHighest,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 10 }}>
      <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable style={btn} onPress={() => onChange(-step)}>
          <Text style={{ color: C.text, fontSize: 20 }}>−</Text>
        </Pressable>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>
          {value.toFixed(2)} <Text style={{ color: C.outline, fontSize: 12 }}>{unit}</Text>
        </Text>
        <Pressable style={btn} onPress={() => onChange(step)}>
          <Text style={{ color: C.text, fontSize: 20 }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
