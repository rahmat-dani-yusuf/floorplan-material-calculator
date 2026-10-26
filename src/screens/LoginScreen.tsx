import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import LoginMascot from '../components/LoginMascot';
import { peringatan } from '../utils/confirm';
import { masuk, daftar, lupaSandi } from '../services/authService';
import { C } from '../theme';

export default function LoginScreen({ onLogin, onGuest }: { onLogin: (name: string) => void; onGuest: () => void }) {
  const [email, setEmail] = useState('');
  const [nameReg, setNameReg] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwdFocused, setPwdFocused] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'error' | 'success' | null>(null);
  const [tab, setTab] = useState<'masuk' | 'daftar'>('masuk');
  const { height } = useWindowDimensions();
  const fade = new Animated.Value(0);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }).start();
    return () => { /* timer loop none here */ };
  }, []);

  const handleLogin = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 4) { peringatan('Validasi', 'Masukkan email yang valid dan kata sandi minimal 4 karakter'); return; }
    setMsg('');
    setMsgType(null);
    setLoading(true);
    masuk(email.trim().toLowerCase(), password).then((r) => {
      setLoading(false);
      if (r.ok) { setMsg('Masuk berhasil'); setMsgType('success'); onLogin(email.trim().toLowerCase()); }
      else { setMsg(r.msg || 'Gagal masuk'); setMsgType('error'); }
    });
  };

  const handleDaftar = () => {
    if (!nameReg.trim() || !email.trim() || password.length < 6 || password !== confirmPass) {
      peringatan('Validasi', 'Isi semua, sandi min 6, dan ulangi sama');
      return;
    }
    setLoading(true);
    daftar(nameReg.trim(), email.trim().toLowerCase(), password).then((r) => {
      setLoading(false);
      if (r.ok) { setMsg('Akun berhasil dibuat'); setMsgType('success'); onLogin(email.trim().toLowerCase()); }
      else { setMsg(r.msg || 'Gagal Daftar'); setMsgType('error'); }
    });
  };

  const handleReset = () => {
    if (email.trim()) { lupaSandi(email.trim()).then((r) => peringatan(r.ok ? 'Berhasil' : 'Gagal', r.msg || '')); }
    else { peringatan('Email diperlukan', 'Masukkan email untuk reset'); }
  };

  const handleTogglePass = () => setShowPass((p) => !p);

  const passLabel = showPass ? 'Sembunyikan' : 'Tampilkan';
  const mascotSize = height < 600 ? 120 : 160;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#0b1326' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', width: '100%', maxWidth: 420, gap: 0 }}>
          <View style={{ height: mascotSize + 40, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
            <LoginMascot size={mascotSize} covering={pwdFocused || password.length > 0} />
          </View>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>Selamat Datang</Text>
          <Text numberOfLines={2} style={{ color: '#89ceff', fontSize: 12, marginTop: 4, textAlign: 'center' }}>Masuk untuk melanjutkan denah</Text>
          <View style={{ width: '100%', gap: 12, marginTop: 20 }}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              <Pressable onPress={() => setTab('masuk')} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: tab === 'masuk' ? '#f97316' : '#131b2e', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Masuk</Text>
              </Pressable>
              <Pressable onPress={() => setTab('daftar')} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: tab === 'daftar' ? '#f97316' : '#131b2e', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Daftar</Text>
              </Pressable>
            </View>
            {tab === 'masuk' ? (
              <>
                <Text style={{ color: C.textDim, fontSize: 10, marginBottom: 2 }}>Email</Text>
                <TextInput value={email} onChangeText={setEmail} placeholder="nama@email.com" placeholderTextColor="#8aa4c8" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#131b2e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <TextInput value={password} onChangeText={setPassword} placeholder="Kata sandi" secureTextEntry={!showPass} placeholderTextColor="#8aa4c8" style={{ flex: 1, color: '#fff' }} onFocus={() => setPwdFocused(true)} onBlur={() => setPwdFocused(false)} />
                  <Pressable onPress={handleTogglePass} style={{ paddingLeft: 8 }}>
                    <Text style={{ color: '#89ceff', fontSize: 12 }}>{passLabel}</Text>
                  </Pressable>
                </View>
                <Pressable onPress={handleLogin} disabled={loading} style={{ backgroundColor: '#f97316', borderRadius: 12, padding: 14, alignItems: 'center', minHeight: 44 }}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Masuk</Text>}
                </Pressable>
                <Pressable onPress={handleReset} style={{ padding: 6, alignItems: 'center' }}>
                  <Text style={{ color: '#89ceff', fontSize: 12, fontWeight: '600' }}>Lupa kata sandi?</Text>
                </Pressable>
              </>
            ) : (
              <>
              <Text style={{ color: C.textDim, fontSize: 10, marginBottom: 2 }}>Nama lengkap</Text>
              <TextInput value={nameReg} onChangeText={setNameReg} placeholder="Nama lengkap" placeholderTextColor="#8aa4c8" style={styles.input} />
              <Text style={{ color: C.textDim, fontSize: 10, marginBottom: 2 }}>Email</Text>
              <TextInput value={email} onChangeText={setEmail} placeholder="nama@email.com" placeholderTextColor="#8aa4c8" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#131b2e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <TextInput value={password} onChangeText={setPassword} placeholder="Kata sandi (min 6)" secureTextEntry={!showPass} placeholderTextColor="#8aa4c8" style={{ flex: 1, color: '#fff' }} />
                  <Pressable onPress={handleTogglePass} style={{ paddingLeft: 8 }}>
                    <Text style={{ color: '#89ceff', fontSize: 12 }}>{passLabel}</Text>
                  </Pressable>
                </View>
                <TextInput value={confirmPass} onChangeText={setConfirmPass} placeholder="Ulangi kata sandi" secureTextEntry={!showPass} placeholderTextColor="#8aa4c8" style={styles.input} />
                <Pressable onPress={handleDaftar} disabled={loading} style={{ backgroundColor: '#f97316', borderRadius: 12, padding: 14, alignItems: 'center', minHeight: 44 }}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Daftar</Text>}
                </Pressable>
              </>
            )}
            <Pressable onPress={onGuest} style={{ borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, alignItems: 'center', minHeight: 44, marginTop: 4 }}>
              <Text style={{ color: '#89ceff', fontWeight: '600', fontSize: 14 }}>Masuk sebagai Tamu</Text>
            </Pressable>
              {msg ? (
              <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center', color: msgType === 'success' ? '#4ade80' : '#f97316' }}>
                {msg}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: '#131b2e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
});
