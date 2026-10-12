import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Alert,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { usePriceStore } from '../store/priceStore';
import { DEFAULT_PRICES } from '../constants/materials';
import { C } from '../theme';
import type { BrickType, UnitPrices } from '../types';

const formatRp = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export default function PriceSettingsScreen({ onBack, onBackFrom }: { onBack: () => void; onBackFrom?: 'editor' | 'result' }) {
  const prices = usePriceStore((s) => s.prices);
  const setBrickPrice = usePriceStore((s) => s.setBrickPrice);
  const setPrice = usePriceStore((s) => s.setPrice);
  const resetPrices = usePriceStore((s) => s.resetPrices);

  const [raw, setRaw] = useState<Record<string, string>>({
    bata_merah: String(prices.bata.bata_merah),
    hebel: String(prices.bata.hebel),
    batako: String(prices.bata.batako),
    semen_40kg: String(prices.semen_40kg),
    pasir_m3: String(prices.pasir_m3),
    cat_dasar_liter: String(prices.cat_dasar_liter),
    cat_penutup_liter: String(prices.cat_penutup_liter),
  });

  const handleChange = (key: string, text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setRaw((prev) => ({ ...prev, [key]: digits }));
  };

  const handleBlur = (key: string, storeKey?: string) => {
    const val = parseInt(raw[key] || '0', 10);
    const sanitized = Number.isFinite(val) && val >= 0 ? val : 0;
    setRaw((prev) => ({ ...prev, [key]: String(sanitized) }));
    if (storeKey === 'bata_merah') setBrickPrice('bata_merah', sanitized);
    else if (storeKey === 'hebel') setBrickPrice('hebel', sanitized);
    else if (storeKey === 'batako') setBrickPrice('batako', sanitized);
    else if (storeKey === 'semen_40kg') setPrice('semen_40kg', sanitized);
    else if (storeKey === 'pasir_m3') setPrice('pasir_m3', sanitized);
    else if (storeKey === 'cat_dasar_liter') setPrice('cat_dasar_liter', sanitized);
    else if (storeKey === 'cat_penutup_liter') setPrice('cat_penutup_liter', sanitized);
  };

  const rows = [
    { key: 'bata_merah', label: 'Bata Merah', unit: 'per pcs', storeKey: 'bata_merah' },
    { key: 'hebel', label: 'Hebel', unit: 'per pcs', storeKey: 'hebel' },
    { key: 'batako', label: 'Batako', unit: 'per pcs', storeKey: 'batako' },
    { key: 'semen_40kg', label: 'Semen 40 kg', unit: 'per sak', storeKey: 'semen_40kg' },
    { key: 'pasir_m3', label: 'Pasir', unit: 'per m³', storeKey: 'pasir_m3' },
    { key: 'cat_dasar_liter', label: 'Cat Dasar (primer)', unit: 'per liter', storeKey: 'cat_dasar_liter' },
    { key: 'cat_penutup_liter', label: 'Cat Penutup (topcoat)', unit: 'per liter', storeKey: 'cat_penutup_liter' },
  ];

  const confirmReset = () => {
    Alert.alert('Konfirmasi', 'Kembalikan harga ke bawaan?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Ya', onPress: () => {
        resetPrices();
        setRaw({
          bata_merah: String(DEFAULT_PRICES.bata.bata_merah),
          hebel: String(DEFAULT_PRICES.bata.hebel),
          batako: String(DEFAULT_PRICES.bata.batako),
          semen_40kg: String(DEFAULT_PRICES.semen_40kg),
          pasir_m3: String(DEFAULT_PRICES.pasir_m3),
          cat_dasar_liter: String(DEFAULT_PRICES.cat_dasar_liter),
          cat_penutup_liter: String(DEFAULT_PRICES.cat_penutup_liter),
        });
      } },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#131b2e' }}>
          <Pressable onPress={onBack}>
            <Text style={{ color: C.secondary, fontSize: 14 }}>← Kembali</Text>
          </Pressable>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 6 }}>Pengaturan Harga</Text>
          <Text style={{ color: C.outline, fontSize: 12 }}>Harga satuan material dapat diubah</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
          {rows.map((r) => (
            <View key={r.key} style={{ backgroundColor: C.surface, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{r.label}</Text>
              <Text style={{ color: C.secondary, fontSize: 11, marginBottom: 6 }}>{r.unit}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: C.textDim, fontWeight: '600', fontSize: 13 }}>Rp</Text>
                <TextInput
                  style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700', backgroundColor: C.surfaceHighest, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
                  keyboardType="numeric"
                  value={formatRp(parseInt(raw[r.key] || '0', 10)).replace('Rp ', '')}
                  onChangeText={(t) => handleChange(r.key, t)}
                  onBlur={() => handleBlur(r.key, r.storeKey)}
                  onFocus={() => {
                    setRaw((prev) => ({ ...prev, [r.key]: String(parseInt(prev[r.key] || '0', 10)) }));
                  }}
                />
              </View>
            </View>
          ))}

          <Pressable
            onPress={confirmReset}
            style={{ backgroundColor: '#93000a55', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: C.error, fontWeight: '700', fontSize: 13 }}>Kembalikan Harga Bawaan</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
