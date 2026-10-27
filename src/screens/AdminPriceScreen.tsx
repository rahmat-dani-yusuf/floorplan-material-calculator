import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { peringatan } from '../utils/confirm';
import { usePriceStore } from '../store/priceStore';
import { fetchMarketPrices, fetchPricesMeta, saveMarketPrices } from '../services/priceCloud';
import { C } from '../theme';
import type { UnitPrices } from '../types';

const formatRp = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const formatTanggal = (t: number | null) => {
  if (!t) return 'Belum pernah diperbarui';
  try {
    return new Date(t).toLocaleString('id-ID');
  } catch {
    return String(t);
  }
};

type RowKey = keyof Omit<UnitPrices, 'bata'> | keyof UnitPrices['bata'];

const rows: { key: RowKey; label: string; unit: string }[] = [
  { key: 'bata_merah', label: 'Bata Merah', unit: 'per pcs' },
  { key: 'hebel', label: 'Hebel', unit: 'per pcs' },
  { key: 'batako', label: 'Batako', unit: 'per pcs' },
  { key: 'semen_40kg', label: 'Semen 40 kg', unit: 'per sak' },
  { key: 'pasir_m3', label: 'Pasir', unit: 'per m³' },
  { key: 'cat_dasar_liter', label: 'Cat Dasar (primer)', unit: 'per liter' },
  { key: 'cat_penutup_liter', label: 'Cat Penutup (topcoat)', unit: 'per liter' },
];

const toRaw = (p: UnitPrices): Record<string, string> => ({
  bata_merah: String(p.bata.bata_merah),
  hebel: String(p.bata.hebel),
  batako: String(p.bata.batako),
  semen_40kg: String(p.semen_40kg),
  pasir_m3: String(p.pasir_m3),
  cat_dasar_liter: String(p.cat_dasar_liter),
  cat_penutup_liter: String(p.cat_penutup_liter),
});

const parseNum = (s: string) => {
  const v = parseInt((s || '0').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

const emptyPrices: UnitPrices = {
  bata: { bata_merah: 0, hebel: 0, batako: 0 },
  semen_40kg: 0,
  pasir_m3: 0,
  cat_dasar_liter: 0,
  cat_penutup_liter: 0,
};

export default function AdminPriceScreen({ onBack }: { onBack: () => void }) {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const pakaiHargaPasar = usePriceStore((s) => s.pakaiHargaPasar);
  const marketPrices = usePriceStore((s) => s.marketPrices);

  const [raw, setRaw] = useState<Record<string, string>>(() => toRaw(marketPrices ?? emptyPrices));
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [prices, meta] = await Promise.all([fetchMarketPrices(), fetchPricesMeta()]);
        if (!alive) return;
        if (prices) setRaw(toRaw(prices));
        if (meta) setUpdatedAt(meta.updatedAt);
      } catch (e: any) {
        console.warn('[adminPrice] gagal memuat', e?.code || e?.message || e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      peringatan('Khusus admin', 'Hanya admin yang dapat mengakses harga pasar.');
      onBack();
    }
  }, [isAdmin, onBack]);

  if (!isAdmin) return null;

  const handleChange = (key: string, text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setRaw((prev) => ({ ...prev, [key]: digits }));
  };

  const handleSave = async () => {
    if (!uid) {
      peringatan('Gagal', 'Sesi tidak valid. Silakan login ulang.');
      return;
    }
    const prices: UnitPrices = {
      bata: {
        bata_merah: parseNum(raw.bata_merah),
        hebel: parseNum(raw.hebel),
        batako: parseNum(raw.batako),
      },
      semen_40kg: parseNum(raw.semen_40kg),
      pasir_m3: parseNum(raw.pasir_m3),
      cat_dasar_liter: parseNum(raw.cat_dasar_liter),
      cat_penutup_liter: parseNum(raw.cat_penutup_liter),
    };
    setSaving(true);
    try {
      await saveMarketPrices(prices, uid);
      setUpdatedAt(Date.now());
      pakaiHargaPasar();
      peringatan('Tersimpan', 'Harga pasar berhasil disimpan ke cloud.');
    } catch (e: any) {
      const code = e?.code || e?.message || e;
      console.warn('[adminPrice] gagal simpan', code);
      peringatan('Gagal menyimpan', String(code || 'Terjadi kesalahan saat menyimpan harga.'));
    } finally {
      setSaving(false);
    }
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
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 6 }}>Admin: Harga Pasar</Text>
          <Text style={{ color: C.outline, fontSize: 12 }}>Harga global untuk semua pengguna</Text>
          <Text style={{ color: C.tertiary, fontSize: 11, marginTop: 4 }}>
            Terakhir diperbarui: {formatTanggal(updatedAt)}
          </Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        ) : (
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
                    onFocus={() => setRaw((prev) => ({ ...prev, [r.key]: String(parseInt(prev[r.key] || '0', 10)) }))}
                  />
                </View>
              </View>
            ))}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{ backgroundColor: C.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8, opacity: saving ? 0.5 : 1 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{saving ? 'Menyimpan…' : 'Simpan ke cloud'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
