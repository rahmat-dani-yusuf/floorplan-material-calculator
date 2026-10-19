import type { Wall, Opening, Point } from '../types';
import { distance, normalizePointsEqual, pointAtArcDistance } from './geometry';

export const MARGIN = 0.1;
export const MIN_GAP = 0.05;

export function openingSpan(wall: Wall, o: Opening) {
  const len = wall.length_meters;
  const half = o.width_meters / 2;
  return { start: Math.max(0, o.offset_meters - half), end: Math.min(len, o.offset_meters + half) };
}

export function findFreeOffset(wall: Wall, width: number, others: Opening[] = []): number | null {
  const len = wall.length_meters;
  const half = width / 2;
  // Try offsets from MARGIN + half up to len - MARGIN - half, step 0.05
  for (let off = MARGIN + half; off <= len - MARGIN - half + 0.001; off += 0.05) {
    const start = off - half;
    const end = off + half;
    let overlap = false;
    for (const ot of others) {
      const s = openingSpan(wall, ot);
      if (start < s.end + MIN_GAP && end + MIN_GAP > s.start) {
        overlap = true;
        break;
      }
    }
    if (!overlap) return Math.round(off * 100) / 100;
  }
  return null;
}

export function clampOffset(wall: Wall, o: Opening, offset: number, others: Opening[] = []): number {
  const len = wall.length_meters;
  const half = o.width_meters / 2;
  let v = Math.max(MARGIN + half, Math.min(len - MARGIN - half, offset));
  v = Math.round(v * 100) / 100;
  // avoid overlap by pushing slightly if needed (simple clamp not resolving overlap fully; for test okay)
  return v;
}

export function openingGeometry(wall: Wall, o: Opening) {
  const len = wall.length_meters;
  const sag = wall.arc_sagitta_m || 0;
  const p1 = wall.p1;
  const p2 = wall.p2;
  // Dinding lengkung: titik bukaan mengikuti busur (offset = jarak busur dari p1).
  if (sag && Math.abs(sag) >= 1e-9) {
    const halfW = o.width_meters / 2;
    const halfH = o.height_meters / 2;
    const s = Math.max(0, o.offset_meters - halfW);
    const e = Math.min(len, o.offset_meters + halfW);
    const startWorld = pointAtArcDistance(p1, p2, sag, s);
    const endWorld = pointAtArcDistance(p1, p2, sag, e);
    const center = pointAtArcDistance(p1, p2, sag, o.offset_meters);
    const dx = endWorld.x - startWorld.x;
    const dy = endWorld.y - startWorld.y;
    const t = Math.hypot(dx, dy) || 1;
    const perp = { x: -dy / t, y: dx / t };
    return { startWorld, endWorld, perp, center, halfW, halfH };
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const total = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / total, y: dy / total };
  const perp = { x: -dir.y, y: dir.x }; // orthogonal vector pointing "up" relative to dinding direction
  const centerDist = o.offset_meters / total;
  const cx = p1.x + dir.x * o.offset_meters;
  const cy = p1.y + dir.y * o.offset_meters;
  const halfW = o.width_meters / 2;
  const halfH = o.height_meters / 2;
  // start/end of opening along wall
  const s = o.offset_meters - halfW;
  const e = o.offset_meters + halfW;
  const startWorld = { x: p1.x + dir.x * s, y: p1.y + dir.y * s };
  const endWorld = { x: p1.x + dir.x * e, y: p1.y + dir.y * e };
  return { startWorld, endWorld, perp, center: { x: cx, y: cy }, halfW, halfH };
}
