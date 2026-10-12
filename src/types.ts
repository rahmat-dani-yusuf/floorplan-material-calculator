// ===== LANGKAH 1: Tipe data =====

export type BrickType = 'bata_merah' | 'hebel' | 'batako';
export type MortarRatio = '1:4' | '1:2';

export interface Point {
  x: number;
  y: number;
}

/** State dinding aktif (sesuai spesifikasi). */
export interface Opening {
  id: string;
  type: 'pintu' | 'jendela';
  width_meters: number;
  height_meters: number;
  quantity: number;
  offset_meters: number;
  swing: 1 | -1;
}

export interface WallState {
  p1: Point;
  p2: Point;
  length_meters: number;
  height_meters: number;
  brick_type: BrickType;
  mortar_ratio: MortarRatio;
  openings: Opening[];
}

/** Hasil hitung kuantitas (belum berharga). */
export interface MaterialQuantities {
  gross_area_m2: number;
  openings_area_m2: number;
  area_m2: number;
  bricks_pcs: number;
  cement_bags_40kg: number;
  sand_m3: number;
  primer_liters: number;
  topcoat_liters: number;
}

/** Harga satuan lokal (Rupiah). */
export interface UnitPrices {
  bata: Record<BrickType, number>; // per buah
  semen_40kg: number; // per sak 40 kg
  pasir_m3: number; // per m3
  cat_dasar_liter: number; // per liter (primer)
  cat_penutup_liter: number; // per liter (topcoat)
}

export type LineItemCategory = 'Bata' | 'Semen' | 'Pasir' | 'Cat';

export interface CostLineItem {
  category: LineItemCategory;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

export interface CostSummary {
  wall: Wall;
  quantities: MaterialQuantities;
  line_items: CostLineItem[];
  grand_total: number;
}

export interface Wall extends WallState {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  walls: Wall[];
  createdAt: number;
  updatedAt: number;
  rooms?: any[];
  dedupeOverlap?: boolean;
}

export interface Room {
  id: string;
  name: string;
  seed: Point;
}

export interface ProjectSummary {
  perWall: CostSummary[];
  line_items: CostLineItem[];
  total_area_m2: number;
  grand_total: number;
}
