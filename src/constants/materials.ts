// ===== LANGKAH 2: Konstanta rumus & harga =====
import type { BrickType, UnitPrices } from '../types';

/** Koefisien bata per m2 dinding. */
export const BRICK_COEFFICIENT: Record<BrickType, number> = {
  bata_merah: 70,
  hebel: 8.3,
  batako: 12.5,
};

export const BRICK_LABEL: Record<BrickType, string> = {
  bata_merah: 'Bata Merah',
  hebel: 'Bata Ringan (Hebel)',
  batako: 'Batako',
};

export const WASTE_FACTOR = 1.05; // buffer 5%

export const CEMENT_KG_PER_M2 = 11.5;
export const CEMENT_BAG_KG = 40;
export const SAND_M3_PER_M2 = 0.045;

export const PAINT_SIDES = 2;
export const PAINT_COATS = 2;
export const PRIMER_M2_PER_LITER = 10;
export const TOPCOAT_M2_PER_LITER = 12;

/** Batas input wajar (meter) untuk validasi. */
export const LIMITS = { min: 0.5, max: 100 } as const;

export const DEFAULT_PINTU = { width_meters: 0.9, height_meters: 2.1 };
export const DEFAULT_JENDELA = { width_meters: 1.2, height_meters: 1.2 };
export const OPENING_LIMITS = { min: 0.3, max: 5, qtyMin: 1, qtyMax: 20 } as const;

/** Harga dasar default — ganti sesuai harga toko/daerah. */
export const DEFAULT_PRICES: UnitPrices = {
  bata: { bata_merah: 950, hebel: 12_000, batako: 3_500 },
  semen_40kg: 55_000,
  pasir_m3: 350_000,
  cat_dasar_liter: 45_000,
  cat_penutup_liter: 60_000,
};
