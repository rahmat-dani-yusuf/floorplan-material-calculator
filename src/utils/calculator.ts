// ===== LANGKAH 3: Material Calculator Engine (fungsi murni, tanpa UI) =====
import {
  BRICK_COEFFICIENT, WASTE_FACTOR, CEMENT_KG_PER_M2, CEMENT_BAG_KG,
  SAND_M3_PER_M2, PAINT_SIDES, PAINT_COATS, PRIMER_M2_PER_LITER, TOPCOAT_M2_PER_LITER,
} from '../constants/materials';
import type { BrickType, MaterialQuantities, WallState, Opening } from '../types';
import { effectiveWallLength } from './geometry';

/** Pembulatan ke n desimal (default 2). */
export const round = (value: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
};

/** Area = length * height */
export const calcArea = (length_meters: number, height_meters: number): number =>
  length_meters * height_meters;

/** Bricks = Area * koefisien * 1.05 */
export const calcBricks = (area: number, brick: BrickType): number =>
  area * BRICK_COEFFICIENT[brick] * WASTE_FACTOR;

/** Semen sak 40 kg = (Area * 11.5 / 40) * 1.05 */
export const calcCementBags = (area: number): number =>
  ((area * CEMENT_KG_PER_M2) / CEMENT_BAG_KG) * WASTE_FACTOR;

/** Pasir m3 = (Area * 0.045) * 1.05 */
export const calcSandM3 = (area: number): number =>
  area * SAND_M3_PER_M2 * WASTE_FACTOR;

/** Cat dasar (L) = Area * 2 sisi / 10 */
export const calcPrimerLiters = (area: number): number =>
  (area * PAINT_SIDES) / PRIMER_M2_PER_LITER;

/** Cat penutup (L) = Area * 2 sisi * 2 lapis / 12 */
export const calcTopcoatLiters = (area: number): number =>
  (area * PAINT_SIDES * PAINT_COATS) / TOPCOAT_M2_PER_LITER;

export const calcOpeningsArea = (openings: Opening[]): number =>
  openings.reduce((sum, o) => sum + o.width_meters * o.height_meters * o.quantity, 0);

export const calcNetArea = (length_meters: number, height_meters: number, openings: Opening[]): number => {
  const gross = calcArea(length_meters, height_meters);
  const open = calcOpeningsArea(openings);
  return Math.max(0, gross - open);
};

/**
 * Hitung semua kebutuhan material (nilai teoretis, belum dibulatkan beli).
 * Catatan: mortar_ratio disimpan di state tetapi rumus spesifikasi
 * memakai koefisien tunggal, jadi belum mempengaruhi hasil.
 */
export function calculateMaterials(wall: WallState): MaterialQuantities {
  // Dinding lengkung memakai panjang busur, bukan jarak lurus.
  const len = effectiveWallLength(wall);
  const gross_area = calcArea(len, wall.height_meters);
  const openings_area = calcOpeningsArea(wall.openings ?? []);
  const net_area = Math.max(0, gross_area - openings_area);
  return {
    gross_area_m2: gross_area,
    openings_area_m2: openings_area,
    area_m2: net_area,
    bricks_pcs: calcBricks(net_area, wall.brick_type),
    cement_bags_40kg: calcCementBags(net_area),
    sand_m3: calcSandM3(net_area),
    primer_liters: calcPrimerLiters(net_area),
    topcoat_liters: calcTopcoatLiters(net_area),
  };
}
