import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PRICES } from '../constants/materials';
import type { UnitPrices, BrickType } from '../types';
import { fetchMarketPrices } from '../services/priceCloud';
import { useAuthStore } from './authStore';

interface PriceStore {
  prices: UnitPrices;
  // Harga pasar dari cloud (config/prices). Tidak dipersist; di-fetch ulang.
  marketPrices: UnitPrices | null;
  // True bila user mengubah harga sendiri (bukan dari harga pasar).
  userAdjustedPrices: boolean;
  setBrickPrice: (type: BrickType, value: number) => void;
  setPrice: (key: 'semen_40kg' | 'pasir_m3' | 'cat_dasar_liter' | 'cat_penutup_liter', value: number) => void;
  resetPrices: () => void;
  // Ambil harga pasar; terapkan bila user belum mengubah harga sendiri.
  // Kalau gagal/offline, pertahankan harga lokal terakhir.
  loadMarketPrices: () => Promise<void>;
  // Kembalikan harga ke harga admin (harga pasar).
  pakaiHargaPasar: () => Promise<void>;
}

const sanitize = (v: number) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

// Kunci penyimpanan harga pribadi dipisah per pengguna agar harga akun A
// tidak terbawa ke akun B di browser/perangkat yang sama.
const priceStorageKey = (): string => {
  const s = useAuthStore.getState();
  if (s.isGuest) return 'prices-v2-guest';
  return s.user?.uid ? `prices-v2-${s.user.uid}` : 'prices-v2-anonymous';
};

const priceStorage = createJSONStorage(() => ({
  getItem: async (_name: string) => AsyncStorage.getItem(priceStorageKey()),
  setItem: async (_name: string, value: string) =>
    AsyncStorage.setItem(priceStorageKey(), value),
  removeItem: async (_name: string) =>
    AsyncStorage.removeItem(priceStorageKey()),
}));

export const usePriceStore = create<PriceStore>()(
  persist(
    (set, get) => {
      return {
        prices: DEFAULT_PRICES,
        marketPrices: null,
        userAdjustedPrices: false,
        setBrickPrice: (type, value) =>
          set((s) => ({
            prices: {
              ...s.prices,
              bata: { ...s.prices.bata, [type]: sanitize(value) },
            },
            userAdjustedPrices: true,
          })),
        setPrice: (key, value) =>
          set((s) => ({
            prices: { ...s.prices, [key]: sanitize(value) },
            userAdjustedPrices: true,
          })),
        resetPrices: () => set({ prices: DEFAULT_PRICES, userAdjustedPrices: false }),
        loadMarketPrices: async () => {
          try {
            const mp = await fetchMarketPrices();
            if (!mp) return; // dokumen belum ada -> pertahankan lokal
            // Terapkan harga pasar hanya bila user belum mengubah harga sendiri.
            if (!get().userAdjustedPrices) {
              set({ prices: mp, marketPrices: mp });
            } else {
              set({ marketPrices: mp });
            }
          } catch {
            // gagal/offline -> pertahankan harga lokal terakhir
          }
        },
        pakaiHargaPasar: async () => {
          let mp = get().marketPrices;
          if (!mp) {
            try {
              mp = await fetchMarketPrices();
            } catch {
              mp = null;
            }
          }
          if (mp) set({ prices: mp, marketPrices: mp, userAdjustedPrices: false });
        },
      };
    },
    {
      name: 'floorplan-prices',
      storage: priceStorage,
      // Harga lokal per-akun & flag penyesuaian dipersist seperti sekarang.
      partialize: (s) => ({ prices: s.prices, userAdjustedPrices: s.userAdjustedPrices }),
    },
  ))
;

// Ambil harga pasar saat app mulai (harga global bisa dibaca siapa saja).
usePriceStore.getState().loadMarketPrices();

// Ambil ulang saat status auth berubah (login/logout/daftar).
// Muat harga tersimpan milik pengguna baru dari kunci miliknya sendiri,
// sehingga harga pribadi pengguna sebelumnya tidak bocor ke pengguna berikutnya.
useAuthStore.subscribe((s, prev) => {
  const uidChanged = s.user?.uid !== prev?.user?.uid;
  const guestChanged = s.isGuest !== prev?.isGuest;
  if (!uidChanged && !guestChanged) return;
  void rehydratePricesOnAuthChange();
});

async function rehydratePricesOnAuthChange(): Promise<void> {
  const raw = await AsyncStorage.getItem(priceStorageKey());
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        prices?: UnitPrices;
        userAdjustedPrices?: boolean;
      };
      usePriceStore.setState({
        prices: parsed.prices ?? DEFAULT_PRICES,
        userAdjustedPrices: parsed.userAdjustedPrices ?? false,
      });
    } catch {
      usePriceStore.getState().resetPrices();
    }
  } else {
    usePriceStore.getState().resetPrices();
  }
  usePriceStore.getState().loadMarketPrices();
}

