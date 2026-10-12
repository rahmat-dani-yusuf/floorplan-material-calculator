import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View, Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useWallStore } from '../store/wallStore';
import { usePriceStore } from '../store/priceStore';
import { useProjectStore } from '../store/projectStore';
import { buildProjectSummary, buildCostSummary, formatRupiah } from '../utils/pricing';
import { buildRabText, buildRabHtml } from '../utils/exportRab';
import { BRICK_LABEL } from '../constants/materials';
import { C } from '../theme';

export default function ResultScreen({ onBack, onOpenPrices, onOpenProjects }: { onBack: () => void; onOpenPrices?: () => void; onOpenProjects?: () => void }) {
  const walls = useWallStore((s) => s.walls);
  const prices = usePriceStore((s) => s.prices);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projects = useProjectStore((s) => s.projects);
  const summary = buildProjectSummary(walls, prices);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [preparing, setPreparing] = useState(false);

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const projectName = (() => {
    if (!currentProjectId) return 'Proyek Baru';
    const p = projects.find((pr) => pr.id === currentProjectId);
    return p ? p.name || 'Proyek Baru' : 'Proyek Baru';
  })();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#131b2e' }}>
        <Pressable onPress={onBack}>
          <Text style={{ color: C.secondary, fontSize: 14 }}>← Kembali ke Editor</Text>
        </Pressable>
        {onOpenPrices && (
          <Pressable onPress={onOpenPrices} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Text style={{ color: C.tertiary, fontSize: 13, fontWeight: '600' }}>Pengaturan Harga →</Text>
          </Pressable>
        )}
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 6 }}>Hasil Kalkulasi & RAB</Text>
        <Text style={{ color: C.outline, fontSize: 12 }}>
          {summary.total_area_m2.toFixed(2)} m² • {walls.length} dinding
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {/* Total proyek */}
        <View style={{ backgroundColor: C.surfaceHigh, borderRadius: 12, padding: 16 }}>
          <Text style={{ color: C.outline, fontSize: 11 }}>LUAS NETTO</Text>
          <Text style={{ color: C.primarySoft, fontSize: 28, fontWeight: '700' }}>{formatRupiah(summary.grand_total)}</Text>
          <Text style={{ color: C.secondary, fontSize: 12, marginTop: 4 }}>
            Luas netto {summary.total_area_m2.toFixed(2)} m²
          </Text>
          <Text style={{ color: C.secondary, fontSize: 11, marginTop: 2 }}>
            Harga mengikuti Pengaturan Harga
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Pressable
            onPress={() => {
              if (Platform.OS === 'web') {
                Alert.alert('Fitur ini hanya tersedia di HP');
                return;
              }
              const text = buildRabText(projectName, summary);
              Share.share({ message: text }).catch(() => {});
            }}
            style={{ flex: 1, backgroundColor: C.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}
          >
            <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>Bagikan Teks</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              if (Platform.OS === 'web') {
                Alert.alert('Fitur ini hanya tersedia di HP');
                return;
              }
              try {
                setPreparing(true);
                const html = buildRabHtml(projectName, summary);
                const { uri } = await Print.printToFileAsync({ html });
                const available = await Sharing.isAvailableAsync();
                if (!available) {
                  Alert.alert('Tidak bisa membagikan', 'Fitur berbagi tidak tersedia di perangkat ini.');
                  return;
                }
                await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Bagikan RAB PDF' });
              } catch (e) {
                Alert.alert('Gagal membuat PDF', 'Coba lagi.');
              } finally {
                setPreparing(false);
              }
            }}
            style={{ flex: 1, backgroundColor: C.primary, borderRadius: 10, padding: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{preparing ? 'Menyiapkan PDF...' : 'Ekspor PDF'}</Text>
          </Pressable>
        </View>

        {/* Line items gabungan */}
        {summary.line_items.map((i) => (
          <View key={i.name} style={{ backgroundColor: C.surface, borderRadius: 10, padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.tertiary, fontSize: 11 }}>{i.category.toUpperCase()}</Text>
                <Text style={{ color: C.text, fontWeight: '600' }}>{i.name}</Text>
              </View>
              <Text style={{ color: C.text, fontWeight: '700' }}>
                {i.quantity.toLocaleString('id-ID')} {i.unit}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: C.outline, fontSize: 12 }}>@ {formatRupiah(i.unit_price)}</Text>
              <Text style={{ color: C.text, fontWeight: '600' }}>{formatRupiah(i.subtotal)}</Text>
            </View>
          </View>
        ))}

        {/* Rincian per dinding */}
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginTop: 8 }}>Rincian per Dinding</Text>
        {summary.perWall.map((cs) => (
          <View key={cs.wall.id} style={{ backgroundColor: C.surface, borderRadius: 10, padding: 12, marginTop: 6 }}>
            <Pressable onPress={() => toggle(cs.wall.id)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>
                  {cs.wall.name}
                </Text>
                <Text style={{ color: C.secondary, fontSize: 11 }}>
                  {cs.wall.length_meters.toFixed(2)} × {cs.wall.height_meters.toFixed(2)} m • {BRICK_LABEL[cs.wall.brick_type]} • Adukan {cs.wall.mortar_ratio}
                </Text>
              </View>
              <Text style={{ color: C.primary, fontSize: 16, fontWeight: '700' }}>{formatRupiah(cs.grand_total)}</Text>
            </Pressable>
            {open[cs.wall.id] && (
              <View style={{ marginTop: 8, gap: 4 }}>
                <Text style={{ color: C.secondary, fontSize: 11 }}>Luas kotor {cs.quantities.gross_area_m2.toFixed(2)} m² − bukaan {cs.quantities.openings_area_m2.toFixed(2)} m² = netto {cs.quantities.area_m2.toFixed(2)} m²</Text>
                <Text style={{ color: C.text, fontWeight: '600' }}>{cs.line_items.length} item</Text>
                {cs.line_items.map((item) => (
                  <View key={item.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                    <Text style={{ color: C.text, fontSize: 12 }}>{item.name}</Text>
                    <Text style={{ color: C.text, fontSize: 12 }}>{item.quantity} {item.unit} → {formatRupiah(item.subtotal)}</Text>
          <Text style={{ color: C.secondary, fontSize: 11, marginTop: 2 }}>
            Harga mengikuti Pengaturan Harga
          </Text>
        </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
