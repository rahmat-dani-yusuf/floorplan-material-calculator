import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { C } from '../theme';

export default function TemplateModal({ visible, onSelect, onBatal }: { visible: boolean; onSelect: (template: string) => void; onBatal: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBatal}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Pilih Template</Text>
          <Pressable onPress={() => onSelect('21')} style={styles.option}>
            <Text style={styles.optionText}>Rumah Tipe 21 (6 x 3,5 m)</Text>
            <Text style={styles.desc}>21 m2 • 1 kamar • Minimalis: tamu, dapur, kamar, mandi</Text>
          </Pressable>
          <Pressable onPress={() => onSelect('45')} style={styles.option}>
            <Text style={styles.optionText}>Rumah Tipe 45 (7,5 x 6 m)</Text>
            <Text style={styles.desc}>45 m2 • 2 kamar • Ruang tamu, dapur, 2 kamar tidur</Text>
          </Pressable>
          <Pressable onPress={() => onSelect('48')} style={styles.option}>
            <Text style={styles.optionText}>Rumah Tipe 48 (8 x 6 m)</Text>
            <Text style={styles.desc}>Dinding luar menyambung + sekat + 5 ruangan</Text>
          </Pressable>
          <Pressable onPress={() => onSelect('36')} style={styles.option}>
            <Text style={styles.optionText}>Rumah Tipe 36 (6 x 6 m)</Text>
            <Text style={styles.desc}>36 m2 • 2 kamar • Ruang tamu, dapur, 2 kamar tidur</Text>
          </Pressable>
          <Pressable onPress={onBatal} style={[styles.btn, { backgroundColor: '#334155' }]}>
            <Text style={styles.btnText}>Batal</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#1e293b', borderRadius: 16, padding: 20, gap: 10 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  option: { backgroundColor: '#334155', borderRadius: 10, padding: 14, gap: 4 },
  optionText: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  desc: { color: '#94a3b8', fontSize: 12 },
  btn: { paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#f8fafc', fontWeight: '600', fontSize: 14 },
});
