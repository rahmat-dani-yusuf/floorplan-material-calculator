// ===== LANGKAH 4: Harga & ringkasan biaya (RAB) =====
import { BRICK_LABEL, DEFAULT_PRICES } from '../constants/materials';
import type { CostLineItem, CostSummary, UnitPrices, WallState, ProjectSummary, Wall, Floor, FloorSummary, MultiFloorSummary } from '../types';
import { calculateMaterials, round } from './calculator';
import { effectiveWalls } from './overlap';

/** Format Rupiah manual (Intl id-ID tidak selalu ada di Hermes/Android). */
export const formatRupiah = (value: number): string =>
  'Rp ' + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const line = (
  category: CostLineItem['category'], name: string,
  quantity: number, unit: string, unit_price: number,
): CostLineItem => ({
  category, name, quantity, unit, unit_price,
  subtotal: Math.round(quantity * unit_price),
});

/**
 * Buat ringkasan biaya. Bata & semen dibulatkan ke atas (tidak bisa beli
 * pecahan); pasir & cat dibulatkan ke 2 desimal.
 */
export function buildCostSummary(
  wall: Wall,
  prices: UnitPrices = DEFAULT_PRICES,
  options: { dedupeOverlap?: boolean } = {},
): CostSummary {
  const w = options.dedupeOverlap ? (() => {
    const eff = effectiveWalls([wall], { dedupeOverlap: true })[0];
    return { ...wall, length_meters: eff.counted_length };
  })() : wall;
  const q = calculateMaterials(w);

  const line_items: CostLineItem[] = [
    line('Bata', BRICK_LABEL[wall.brick_type], Math.ceil(q.bricks_pcs), 'pcs', prices.bata[wall.brick_type]),
    line('Semen', 'Semen (sak 40 kg)', Math.ceil(q.cement_bags_40kg), 'sak', prices.semen_40kg),
    line('Pasir', 'Pasir pasang', round(q.sand_m3), 'm³', prices.pasir_m3),
    line('Cat', 'Cat dasar (primer)', round(q.primer_liters), 'liter', prices.cat_dasar_liter),
    line('Cat', 'Cat penutup (topcoat)', round(q.topcoat_liters), 'liter', prices.cat_penutup_liter),
  ];

  return {
    wall,
    quantities: q,
    line_items,
    grand_total: line_items.reduce((sum, i) => sum + i.subtotal, 0),
  };
}

export function buildProjectSummary(
  walls: Wall[],
  prices: UnitPrices = DEFAULT_PRICES,
  options: { dedupeOverlap?: boolean } = {},
): ProjectSummary {
  const perWall = walls.map((w) => buildCostSummary(w, prices, options));

  const brickRaw: Record<string, number> = {};
  let cementRaw = 0;
  let sandRaw = 0;
  let primerRaw = 0;
  let topcoatRaw = 0;
  let totalArea = 0;

  for (const w of walls) {
    const q = calculateMaterials(w);
    if (options.dedupeOverlap) {
      const eff = effectiveWalls([w], { dedupeOverlap: true })[0];
      totalArea += eff.counted_length * w.height_meters;
    } else {
      totalArea += q.area_m2;
    }
    brickRaw[w.brick_type] = (brickRaw[w.brick_type] || 0) + q.bricks_pcs;
    cementRaw += q.cement_bags_40kg;
    sandRaw += q.sand_m3;
    primerRaw += q.primer_liters;
    topcoatRaw += q.topcoat_liters;
  }

  // Aggregate from per-wall line items (respects dedupeOverlap via perWall)
  const line_items: CostLineItem[] = [];
  for (const cs of perWall) {
    for (const it of cs.line_items) {
      const existing = line_items.find((l) => l.name === it.name && l.category === it.category);
      if (existing) existing.quantity += it.quantity; // approximate; but better merge by name
    }
  }
  // Rebuild properly by summing quantities per category/name
  const agg: Record<string, CostLineItem> = {};
  for (const cs of perWall) {
    for (const it of cs.line_items) {
      const k = it.category + '||' + it.name;
      if (!agg[k]) agg[k] = { ...it, quantity: 0, subtotal: 0 };
      agg[k].quantity += it.quantity;
      agg[k].subtotal = Math.round(agg[k].quantity * agg[k].unit_price);
    }
  }
  const aggregatedLineItems = Object.values(agg);
  const brickTypes = (Object.keys(BRICK_LABEL) as ('bata_merah' | 'hebel' | 'batako')[]);
  for (const bt of brickTypes) {
    const raw = brickRaw[bt] || 0;
    if (raw > 0) {
      const qty = Math.ceil(raw);
      line_items.push({
        category: 'Bata',
        name: BRICK_LABEL[bt],
        quantity: qty,
        unit: 'pcs',
        unit_price: prices.bata[bt],
        subtotal: Math.round(qty * prices.bata[bt]),
      });
    }
  }

  if (cementRaw > 0) {
    const qty = Math.ceil(cementRaw);
    line_items.push({
      category: 'Semen',
      name: 'Semen (sak 40 kg)',
      quantity: qty,
      unit: 'sak',
      unit_price: prices.semen_40kg,
      subtotal: Math.round(qty * prices.semen_40kg),
    });
  }

  if (sandRaw > 0) {
    const qty = round(sandRaw);
    line_items.push({
      category: 'Pasir',
      name: 'Pasir pasang',
      quantity: qty,
      unit: 'm³',
      unit_price: prices.pasir_m3,
      subtotal: Math.round(qty * prices.pasir_m3),
    });
  }

  if (primerRaw > 0) {
    const qty = round(primerRaw);
    line_items.push({
      category: 'Cat',
      name: 'Cat dasar (primer)',
      quantity: qty,
      unit: 'liter',
      unit_price: prices.cat_dasar_liter,
      subtotal: Math.round(qty * prices.cat_dasar_liter),
    });
  }

  if (topcoatRaw > 0) {
    const qty = round(topcoatRaw);
    line_items.push({
      category: 'Cat',
      name: 'Cat penutup (topcoat)',
      quantity: qty,
      unit: 'liter',
      unit_price: prices.cat_penutup_liter,
      subtotal: Math.round(qty * prices.cat_penutup_liter),
    });
  }

  return {
    perWall,
    line_items: aggregatedLineItems || line_items,
    total_area_m2: round(totalArea),
    grand_total: (aggregatedLineItems || line_items).reduce((sum, i) => sum + i.subtotal, 0),
  };
}

/** Ringkasan per lantai + grand total semua lantai (rumus per dinding tak berubah). */
export function buildMultiFloorSummary(
  floors: Floor[],
  prices: UnitPrices = DEFAULT_PRICES,
): MultiFloorSummary {
  const perFloor: FloorSummary[] = (floors ?? []).map((f) => {
    const summary = buildProjectSummary(f.walls ?? [], prices, { dedupeOverlap: f.dedupeOverlap ?? true });
    return { floorId: f.id, floorName: f.name, wallCount: (f.walls ?? []).length, summary };
  });
  const total_area_m2 = round(perFloor.reduce((s, f) => s + (f.summary.total_area_m2 || 0), 0));
  const grand_total = perFloor.reduce((s, f) => s + (f.summary.grand_total || 0), 0);
  return { perFloor, total_area_m2, grand_total };
}
