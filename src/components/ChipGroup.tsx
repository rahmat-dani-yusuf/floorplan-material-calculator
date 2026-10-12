import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { C } from '../theme';

interface Props<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}

export default function ChipGroup<T extends string>({ label, options, selected, onSelect }: Props<T>) {
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <Pressable
              key={o.value}
              onPress={() => onSelect(o.value)}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                backgroundColor: active ? C.primary : C.surfaceHighest,
              }}
            >
              <Text style={{ color: active ? '#fff' : C.text, fontWeight: active ? '700' : '400', fontSize: 13 }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
