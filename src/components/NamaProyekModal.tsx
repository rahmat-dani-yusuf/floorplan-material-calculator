import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';

export default function NamaProyekModal({ visible, defaultName, onSimpan, onBatal }: { visible: boolean; defaultName: string; onSimpan: (name: string) => void; onBatal: () => void }) {
  const [nama, setNama] = useState(defaultName);

  const handleSimpan = () => {
    const trimmed = nama.trim();
    if (trimmed) onSimpan(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onBatal}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Nama Proyek</Text>
          <TextInput
            style={styles.input}
            value={nama}
            onChangeText={setNama}
            placeholder="Masukkan nama proyek"
            placeholderTextColor="#94a3b8"
            autoFocus={true}
            onSubmitEditing={handleSimpan}
          />
          <View style={styles.row}>
            <Pressable onPress={onBatal} style={[styles.btn, styles.btnBatal]}>
              <Text style={styles.btnText}>Batal</Text>
            </Pressable>
            <Pressable onPress={handleSimpan} style={[styles.btn, styles.btnSimpan]}>
              <Text style={[styles.btnText, styles.btnTextSimpan]}>Simpan</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#1e293b', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { backgroundColor: '#334155', color: '#f8fafc', fontSize: 16, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#475569' },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnBatal: { backgroundColor: '#334155' },
  btnSimpan: { backgroundColor: '#f97316' },
  btnText: { color: '#f8fafc', fontWeight: '600', fontSize: 14 },
  btnTextSimpan: { color: '#fff' },
});
