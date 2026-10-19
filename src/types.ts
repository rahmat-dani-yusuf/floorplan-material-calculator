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
  /** Tinggi busur (sagitta, meter). 0/undefined = lurus. >0 cembung kiri, <0 kanan. */
  arc_sagitta_m?: number;
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
  floors?: Floor[];
  activeFloorId?: string;
}

export interface Room {
  id: string;
  name: string;
  seed: Point;
}

/** Satu lantai dalam proyek bertingkat. */
export interface Floor {
  id: string;
  name: string;
  height_meters: number;
  walls: Wall[];
  rooms?: Room[];
  dedupeOverlap?: boolean;
}

export interface ProjectSummary {
  perWall: CostSummary[];
  line_items: CostLineItem[];
  total_area_m2: number;
  grand_total: number;
}

/** Ringkasan kalkulasi satu lantai + gabungan semua lantai. */
export interface FloorSummary {
  floorId: string;
  floorName: string;
  wallCount: number;
  summary: ProjectSummary;
}

export interface MultiFloorSummary {
  perFloor: FloorSummary[];
  total_area_m2: number;
  grand_total: number;
}

/** Bangun objek lantai default. */
export function defaultFloor(id: string, name: string, walls: Wall[] = [], rooms: Room[] = []): Floor {
  return { id, name, height_meters: 3.2, walls, rooms };
}

let floorSeq = 0;

/** Migrasi proyek lama (tanpa floors) menjadi 1 lantai. */
export function migrateProjectFloors(p: any): Floor[] {
  if (p && Array.isArray(p.floors) && p.floors.length > 0) {
    return p.floors.map((f: any, i: number) => ({
      id: f.id || `f-${i + 1}`,
      name: f.name || `Lantai ${i + 1}`,
      height_meters: Number(f.height_meters) > 0 ? Number(f.height_meters) : 3.2,
      walls: Array.isArray(f.walls) ? f.walls : [],
      rooms: Array.isArray(f.rooms) ? f.rooms : [],
      dedupeOverlap: f.dedupeOverlap ?? p.dedupeOverlap ?? true,
    }));
  }
  floorSeq += 1;
  return [defaultFloor(`f-${Date.now()}-${floorSeq}`, 'Lantai 1', p?.walls || [], p?.rooms || [])];
}
