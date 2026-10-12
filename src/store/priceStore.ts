import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PRICES } from '../constants/materials';
import type { UnitPrices, BrickType } from '../types';

interface PriceStore {
  prices: UnitPrices;
  setBrickPrice: (type: BrickType, value: number) => void;
  setPrice: (key: 'semen_40kg' | 'pasir_m3' | 'cat_dasar_liter' | 'cat_penutup_liter', value: number) => void;
  resetPrices: () => void;
}

const sanitize = (v: number) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

export const usePriceStore = create<PriceStore>()(
  persist(
    (set) => {
      return {
        prices: DEFAULT_PRICES,
        setBrickPrice: (type, value) =>
          set((s) => ({
            prices: {
              ...s.prices,
              bata: { ...s.prices.bata, [type]: sanitize(value) },
            },
          })),
        setPrice: (key, value) =>
          set((s) => ({
            prices: { ...s.prices, [key]: sanitize(value) },
          })),
        resetPrices: () => set({ prices: DEFAULT_PRICES }),
      };
    },
    {
      name: 'floorplan-prices',
      storage: createJSONStorage(() => AsyncStorage),
    }
  ))
;
