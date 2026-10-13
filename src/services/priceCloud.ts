import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_PRICES } from '../constants/materials';
import type { UnitPrices } from '../types';

// Dokumen harga pasar global. Baca: siapa saja. Tulis: hanya admin (aturan Firestore).
const PRICES_DOC = doc(db, 'config', 'prices');

const num = (v: any) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);

/** Ambil harga pasar global dari config/prices. Null bila dokumen belum ada. */
export async function fetchMarketPrices(): Promise<UnitPrices | null> {
  const snap = await getDoc(PRICES_DOC);
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return {
    bata: {
      bata_merah: num(d?.bata?.bata_merah ?? DEFAULT_PRICES.bata.bata_merah),
      hebel: num(d?.bata?.hebel ?? DEFAULT_PRICES.bata.hebel),
      batako: num(d?.bata?.batako ?? DEFAULT_PRICES.bata.batako),
    },
    semen_40kg: num(d?.semen_40kg ?? DEFAULT_PRICES.semen_40kg),
    pasir_m3: num(d?.pasir_m3 ?? DEFAULT_PRICES.pasir_m3),
    cat_dasar_liter: num(d?.cat_dasar_liter ?? DEFAULT_PRICES.cat_dasar_liter),
    cat_penutup_liter: num(d?.cat_penutup_liter ?? DEFAULT_PRICES.cat_penutup_liter),
  };
}

/** Metadata harga pasar (updatedAt / updatedBy). Null bila dokumen belum ada. */
export async function fetchPricesMeta(): Promise<{ updatedAt: number | null; updatedBy: string | null } | null> {
  const snap = await getDoc(PRICES_DOC);
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return { updatedAt: d?.updatedAt ?? null, updatedBy: d?.updatedBy ?? null };
}

/** Tulis harga pasar global (hanya admin yang diizinkan oleh aturan Firestore). */
export async function saveMarketPrices(prices: UnitPrices, updatedBy: string): Promise<void> {
  await setDoc(
    PRICES_DOC,
    {
      bata: {
        bata_merah: num(prices.bata.bata_merah),
        hebel: num(prices.bata.hebel),
        batako: num(prices.bata.batako),
      },
      semen_40kg: num(prices.semen_40kg),
      pasir_m3: num(prices.pasir_m3),
      cat_dasar_liter: num(prices.cat_dasar_liter),
      cat_penutup_liter: num(prices.cat_penutup_liter),
      updatedAt: Date.now(),
      updatedBy: updatedBy || '',
    },
    { merge: true },
  );
}

/** Cek apakah uid ada di koleksi admins/{uid}. Error => false. */
export async function checkIsAdmin(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}
