import type { Wall, Point } from '../types';
import { effectiveWallLength } from './geometry';

function collinear(p1: Point, p2: Point, p3: Point, p4: Point, dTol = 0.02, angTolDeg = 1): boolean {
  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const ang1 = Math.atan2(dy1, dx1) * 180 / Math.PI;
  const ang2 = Math.atan2(dy2, dx2) * 180 / Math.PI;
  if (Math.abs(ang1 - ang2) > angTolDeg && Math.abs(ang1 - ang2 + 180) > angTolDeg && Math.abs(ang1 - ang2 - 180) > angTolDeg) return false;
  // distance from p3 to line p1-p2
  const num = Math.abs((p2.x - p1.x)*(p1.y - p3.y) - (p1.x - p3.x)*(p2.y - p1.y));
  const den = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  return num / den < dTol;
}

export function overlapIntervals(walls: Wall[]): { wallId: string; intervals: { start: number; end: number }[] }[] {
  const result: { wallId: string; intervals: { start: number; end: number }[] }[] = walls.map((w) => ({ wallId: w.id, intervals: [] }));
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i];
    const p1 = wi.p1, p2 = wi.p2;
    const len = wi.length_meters;
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j];
      if (!collinear(p1, p2, wj.p1, wj.p2)) continue;
      // projection along wall i
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const t0 = ((wj.p1.x - p1.x) * dx + (wj.p1.y - p1.y) * dy) / (dx * dx + dy * dy || 1);
      const t1 = ((wj.p2.x - p1.x) * dx + (wj.p2.y - p1.y) * dy) / (dx * dx + dy * dy || 1);
      const s0 = Math.min(t0, t1) * len;
      const s1 = Math.max(t0, t1) * len;
      const overlapStart = Math.max(0, s0);
      const overlapEnd = Math.min(len, s1);
      if (overlapEnd - overlapStart < 0.05) continue;
      // merge intervals for wall i
      result[i].intervals.push({ start: overlapStart, end: overlapEnd });
    }
    // merge
    const arr = result[i].intervals;
    arr.sort((a: {start:number,end:number}, b: {start:number,end:number}) => a.start - b.start);
    const merged: {start:number;end:number}[] = [];
    for (const iv of arr) {
      if (merged.length === 0) merged.push({ ...iv });
      else {
        const last = merged[merged.length - 1];
        if (iv.start <= last.end + 0.02) last.end = Math.max(last.end, iv.end);
        else merged.push({ ...iv });
      }
    }
    if (merged.length > 0) {
      result[i].intervals = merged.filter((iv) => iv.end - iv.start >= 0.05);
    }
  }
  return result;
}

export function effectiveWalls(walls: Wall[], options: { dedupeOverlap?: boolean } = {}): { wallId: string; counted_length: number; counted_openings_area: number; intervals: { start: number; end: number }[] }[] {
  const dedupe = options.dedupeOverlap ?? true;
  const overlap = dedupe ? overlapIntervals(walls) : walls.map((w) => ({ wallId: w.id, intervals: [] }));
  return walls.map((w, idx) => {
    const info = overlap[idx];
    // Dinding lengkung: panjang dasar = busur.
    const len = effectiveWallLength(w);
    let countedLength = len;
    if (dedupe && info.intervals.length > 0) {
      const totalOver = info.intervals.reduce((s, iv) => s + Math.max(0, iv.end - iv.start), 0);
      countedLength = Math.max(0, len - totalOver);
    }
    // openings area deducted: only openings whose center is in non-overlapping part
    const h = w.height_meters;
    let openArea = 0;
    for (const o of w.openings ?? []) {
      const center = o.offset_meters;
      const halfW = o.width_meters / 2;
      const start = center - halfW;
      const end = center + halfW;
      // check if any part of opening is in counted region
      let counted = false;
      for (let s = 0; s < len; s += len / 20) { // sample along wall
        if (s >= start && s <= end) {
          // point s inside opening; is s in non-overlap?
          const inOverlap = info.intervals.some(iv => s >= iv.start && s <= iv.end);
          if (!inOverlap) { counted = true; break; }
        }
      }
      // simpler: if opening center not in any overlap interval, count fully
      if (!info.intervals.some(iv => center >= iv.start && center <= iv.end)) {
        openArea += o.width_meters * o.height_meters * (o.quantity || 1);
      }
    }
    return { wallId: w.id, counted_length: countedLength, counted_openings_area: openArea, intervals: info.intervals };
  });
}
