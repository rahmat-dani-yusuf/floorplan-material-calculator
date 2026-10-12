import { auth } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile } from 'firebase/auth';

function mapError(code: string): string {
  switch (code) {
    case 'auth/invalid-email': return 'Email tidak valid';
    case 'auth/invalid-credential': return 'Kata sandi salah atau akun tidak ditemukan';
    case 'auth/user-not-found': return 'Akun tidak ditemukan';
    case 'auth/wrong-password': return 'Kata sandi salah';
    case 'auth/email-already-in-use': return 'Email sudah terdaftar';
    case 'auth/weak-password': return 'Kata sandi terlalu lemah (minimal 6 karakter)';
    case 'auth/too-many-requests': return 'Terlalu banyak percobaan. Coba lagi nanti';
    case 'auth/network-request-failed': return 'Tidak ada koneksi internet';
    default: return 'Terjadi kesalahan. Coba lagi';
  }
}

export async function daftar(nama: string, email: string, sandi: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, sandi);
    await updateProfile(cred.user, { displayName: nama });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, msg: mapError(e?.code || '') + ' (Kode: ' + (e?.code || '') + ')' };
  }
}

export async function masuk(email: string, sandi: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    await signInWithEmailAndPassword(auth, email, sandi);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, msg: mapError(e?.code || '') + ' (Kode: ' + (e?.code || '') + ')' };
  }
}

export async function keluar(): Promise<void> {
  await signOut(auth);
}

export async function lupaSandi(email: string): Promise<{ ok: boolean; msg?: string }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true, msg: 'Email reset kata sandi dikirim' };
  } catch (e: any) {
    return { ok: false, msg: mapError(e?.code || '') + ' (Kode: ' + (e?.code || '') + ')' };
  }
}
