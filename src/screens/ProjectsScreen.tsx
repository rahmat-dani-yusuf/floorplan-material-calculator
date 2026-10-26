import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useProjectStore } from '../store/projectStore';
import { confirm, peringatan } from '../utils/confirm';
import { useAuthStore } from '../store/authStore';
import { keluar } from '../services/authService';
import { useWallStore } from '../store/wallStore';
import { ambilSemuaProyek } from '../services/projectCloud';
import { C } from '../theme';
import { calcArea } from '../utils/calculator';
import NamaProyekModal from '../components/NamaProyekModal';

export default function ProjectsScreen({ onBack, onSelect }: { onBack: () => void; onSelect: (id: string) => void }) {
  const auth = useAuthStore();
  const projects = useProjectStore((s) => s.projects);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const renameProject = useProjectStore((s) => s.renameProject);
  const syncStatus = useProjectStore((s) => s.syncStatus);
  const syncMessage = useProjectStore((s) => s.syncMessage);
  const setSyncStatus = useProjectStore((s) => s.setSyncStatus);
  const saveCurrentAs = useProjectStore((s) => s.saveCurrentAs);
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultNama, setDefaultNama] = useState('Proyek ' + new Date().toLocaleDateString('id-ID'));

  const totalNetArea = (walls: any[]) => {
    return walls.reduce((sum, w) => {
      const gross = w.length_meters * w.height_meters;
      const open = (w.openings ?? []).reduce((s2: number, o: any) => s2 + o.width_meters * o.height_meters * o.quantity, 0);
      return sum + Math.max(0, gross - open);
    }, 0);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#131b2e' }}>
        <Pressable onPress={onBack}>
          <Text style={{ color: C.secondary, fontSize: 14 }}>â†گ Kembali</Text>
        </Pressable>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 6 }}>Proyek Saya</Text>
        <Text style={{ color: C.secondary, fontSize: 12 }}>Manajemen proyek dinding</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, backgroundColor: syncStatus === 'tersinkron' ? '#16653455' : syncStatus === 'menyinkronkan' ? '#854d0e55' : syncStatus === 'galat' ? '#7f1d1d55' : '#33415555' }}>
            <Text style={{ color: syncStatus === 'galat' ? '#fca5a5' : syncStatus === 'tersinkron' ? '#86efac' : syncStatus === 'menyinkronkan' ? '#fde047' : C.text, fontSize: 11, fontWeight: '600' }}>
              {syncStatus === 'tersinkron' ? 'Tersinkron' : syncStatus === 'menyinkronkan' ? 'Menyinkronkan...' : syncStatus === 'offline' ? 'Offline - akan disinkron' : syncStatus === 'galat' ? 'Galat' : 'Lokal (tamu)'}
            </Text>
          </View>
          <Text style={{ color: C.secondary, fontSize: 11 }}>{auth.user && !auth.isGuest ? 'Akun: ' + (auth.user.email || auth.user.nama || 'Akun') : 'Mode tamu'}</Text>
        </View>

        {syncStatus === 'galat' && (
          <Text style={{ color: '#fca5a5', fontSize: 11, marginTop: 4 }}>{syncMessage || 'Galat sinkron'}</Text>
        )}

        <Pressable
          onPress={async () => {
            const authState = useAuthStore.getState();
            if (authState.user && !authState.isGuest && authState.user.uid) {
              setSyncStatus('menyinkronkan');
              try {
                const cloud = await ambilSemuaProyek(authState.user.uid);
                const current = useProjectStore.getState();
                const merged = [...current.projects];
                const cloudMap = new Map(cloud.map((p: any) => [p.id, p]));
                for (const cp of cloud) {
                  const idx = merged.findIndex((p: any) => p.id === cp.id);
                  if (idx >= 0) {
                    const lp = merged[idx];
                    if ((cp.updatedAt || 0) > (lp.updatedAt || 0)) merged[idx] = { ...lp, ...cp, walls: cp.walls || lp.walls, rooms: cp.rooms || lp.rooms, dedupeOverlap: cp.dedupeOverlap != null ? cp.dedupeOverlap : lp.dedupeOverlap, updatedAt: cp.updatedAt, createdAt: cp.createdAt || lp.createdAt };
                  } else {
                    merged.push(cp);
                  }
                }
                useProjectStore.setState({ projects: merged, syncStatus: 'tersinkron', syncMessage: '' });
              } catch (e: any) {
                const code = e?.code || e?.message || '';
                let msg = 'Galat';
                if (code === 'permission-denied' || String(code).includes('permission-denied') || String(code).includes('PERMISSION_DENIED')) msg = 'Akses ditolak. Periksa Rules Firestore di Firebase.';
                else msg = String(code) || 'Galat tidak dikenal';
                console.warn('[sync]', code);
                setSyncStatus('galat', msg);
              }
            }
          }}
          style={{ marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#334155', alignSelf: 'flex-start' }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Sinkronkan sekarang</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => { setDefaultNama('Proyek ' + new Date().toLocaleDateString('id-ID')); setModalVisible(true); }}
        style={{ backgroundColor: '#f97316', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignSelf: 'center', margin: 12 }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>+ Simpan denah saat ini</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {projects.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: C.secondary, fontSize: 14 }}>Belum ada proyek tersimpan</Text>
          </View>
        )}

        {[...projects].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
          <View key={p.id} style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14 }}>
            <Pressable onPress={() => onSelect(p.id)} style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{p.name}</Text>
              <Text style={{ color: C.secondary, fontSize: 11, marginTop: 2 }}>
                {p.walls.length} dinding â€¢ {totalNetArea(p.walls).toFixed(2)} mآ² netto
              </Text>
              <Text style={{ color: C.outline, fontSize: 10, marginTop: 2 }}>
                Diubah {new Date(p.updatedAt).toLocaleDateString('id-ID')}
              </Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={() => {
                  Alert.prompt('Ganti Nama', 'Masukkan nama baru', [{ text: 'Batal', style: 'cancel' },                   { text: 'Simpan', onPress: (text?: string) => renameProject(p.id, text || p.name) }]);
                }}
                style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: C.surfaceHighest }}
              >
                <Text style={{ color: C.text, fontSize: 12 }}>Ganti Nama</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  confirm('Hapus Proyek', `Hapus "${p.name}"?`, () => deleteProject(p.id));
                }}
                style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#93000a55' }}
              >
                <Text style={{ color: C.error, fontSize: 12 }}>Hapus</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
        <Pressable onPress={() => confirm('Keluar dari akun?', '', () => { auth.logout(); keluar(); })} style={{ margin: 16, padding: 12, borderRadius: 10, backgroundColor: '#1e293b', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Keluar</Text>
        </Pressable>

        <NamaProyekModal
          visible={modalVisible}
          defaultName={defaultNama}
          onSimpan={(nama: string) => {
            setModalVisible(false);
            try {
              saveCurrentAs(nama);
              peringatan('Proyek tersimpan', `"${nama}" disimpan ke lokal.`);
            } catch (e: any) {
              const code = e?.code || e?.message || e;
              console.log('[Firestore error]', code);
              peringatan('Gagal menyimpan', String(code || 'Terjadi kesalahan saat menyimpan proyek.'));
            }
          }}
          onBatal={() => setModalVisible(false)}
        />
    </View>
  );
}
