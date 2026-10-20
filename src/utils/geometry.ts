import type { Point } from '../types';

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallLength(p1: Point, p2: Point): number {
  return Math.round(distance(p1, p2) * 100) / 100;
}

export function snapToGrid(p: Point, step: number): Point {
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

export function snapOrthogonal(from: Point, to: Point, toleranceDeg = 7): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  const near0 = ang < toleranceDeg || ang > 180 - toleranceDeg;
  const near90 = Math.abs(ang - 90) < toleranceDeg || Math.abs(ang - 270) < toleranceDeg;
  if (near0 || near90) {
    if (Math.abs(dx) > Math.abs(dy)) return { x: to.x, y: from.y };
    return { x: from.x, y: to.y };
  }
  return to;
}

export function nearestPoint(p: Point, points: Point[], radius = 0.3): Point | null {
  for (const pt of points) {
    if (distance(p, pt) <= radius) return pt;
  }
  return null;
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const ab2 = ab.x * ab.x + ab.y * ab.y;
  if (ab2 === 0) return distance(p, a);
  let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * ab.x, y: a.y + t * ab.y };
  return distance(p, proj);
}

export function moveEndAlongDirection(p1: Point, p2: Point, newLength: number): Point {
  const len = distance(p1, p2);
  if (len === 0) return p2;
  const ratio = newLength / len;
  return { x: p1.x + (p2.x - p1.x) * ratio, y: p1.y + (p2.y - p1.y) * ratio };
}

export function normalizePointsEqual(a: Point, b: Point, eps = 0.001): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

export function withSyncedLength(wall: { p1: Point; p2: Point; length_meters: number }): { p1: Point; p2: Point; length_meters: number } {
  const len = wallLength(wall.p1, wall.p2);
  return { ...wall, length_meters: len };
}

export function rectRoomWalls(origin: Point, width: number, length: number): { p1: Point; p2: Point }[] {
  const w = width;
  const l = length;
  return [
    { p1: origin, p2: { x: origin.x + w, y: origin.y } },
    { p1: { x: origin.x + w, y: origin.y }, p2: { x: origin.x + w, y: origin.y + l } },
    { p1: { x: origin.x + w, y: origin.y + l }, p2: { x: origin.x, y: origin.y + l } },
    { p1: { x: origin.x, y: origin.y + l }, p2: origin },
  ];
}

export function lShapeRoomWalls(origin: Point, width: number, length: number, cutW: number, cutL: number): { p1: Point; p2: Point }[] {
  if (cutW >= width || cutL >= length) throw new Error('Potongan harus lebih kecil dari ukuran total');
  return [
    { p1: origin, p2: { x: origin.x + width, y: origin.y } },
    { p1: { x: origin.x + width, y: origin.y }, p2: { x: origin.x + width, y: origin.y + length - cutL } },
    { p1: { x: origin.x + width, y: origin.y + length - cutL }, p2: { x: origin.x + width - cutW, y: origin.y + length - cutL } },
    { p1: { x: origin.x + width - cutW, y: origin.y + length - cutL }, p2: { x: origin.x + width - cutW, y: origin.y + length } },
    { p1: { x: origin.x + width - cutW, y: origin.y + length }, p2: { x: origin.x, y: origin.y + length } },
    { p1: { x: origin.x, y: origin.y + length }, p2: origin },
  ];
}

export function findFreeOrigin(walls: { p1: Point; p2: Point }[], gap = 1): Point {
  if (!walls || walls.length === 0) return { x: 0, y: 0 };
  let maxX = -Infinity, minY = Infinity;
  for (const w of walls) {
    for (const p of [w.p1, w.p2]) {
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
    }
  }
  return { x: maxX + gap, y: minY };
}

// ===== Dinding melengkung (busur lingkaran) =====
// Busur didefinisikan oleh p1, p2, dan sagitta h (tinggi busur dari tali ke puncak).
// h > 0 = cembung ke kiri arah p1→p2; h < 0 = cembung ke kanan; h = 0 = lurus.

/** Jarak tali (chord) p1-p2. */
export function chordLength(p1: Point, p2: Point): number {
  return distance(p1, p2);
}

/** Radius minimum = setengah jarak antar ujung (setengah lingkaran). */
export function minRadius(p1: Point, p2: Point): number {
  return chordLength(p1, p2) / 2;
}

/** Radius dari chord c dan sagitta h: R = (h² + (c/2)²) / (2|h|). h=0 → Infinity. */
export function radiusFromSagitta(p1: Point, p2: Point, sagitta: number): number {
  if (!sagitta || Math.abs(sagitta) < 1e-9) return Infinity;
  const c = chordLength(p1, p2);
  return ((sagitta * sagitta) + (c / 2) * (c / 2)) / (2 * Math.abs(sagitta));
}

/** Sagitta dari radius R: h = R − √(R² − (c/2)²). Null bila R < c/2 (tidak valid). */
export function sagittaFromRadius(p1: Point, p2: Point, radius: number): number | null {
  const c = chordLength(p1, p2);
  if (!(radius > 0) || radius < c / 2 - 1e-9) return null;
  return radius - Math.sqrt(Math.max(0, radius * radius - (c / 2) * (c / 2)));
}

/** Panjang busur dari chord c dan sagitta h. h=0 → panjang tali. */
export function arcLength(p1: Point, p2: Point, sagitta: number): number {
  const c = chordLength(p1, p2);
  if (!sagitta || Math.abs(sagitta) < 1e-9 || c < 1e-9) return Math.round(c * 100) / 100;
  const R = radiusFromSagitta(p1, p2, sagitta);
  const theta = 2 * Math.asin(Math.min(1, (c / 2) / R));
  return Math.round(R * theta * 100) / 100;
}

/** Pusat lingkaran busur. Null bila lurus. */
export function arcCenter(p1: Point, p2: Point, sagitta: number): Point | null {
  const c = chordLength(p1, p2);
  if (!sagitta || Math.abs(sagitta) < 1e-9 || c < 1e-9) return null;
  const R = radiusFromSagitta(p1, p2, sagitta);
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const nx = -(p2.y - p1.y) / c;
  const ny = (p2.x - p1.x) / c;
  // Pusat berada di sisi berlawanan dari tonjolan busur.
  const dist = R - Math.abs(sagitta);
  const s = sagitta > 0 ? 1 : -1;
  return { x: mx - s * nx * dist, y: my - s * ny * dist };
}

/** Titik puncak busur (tengah tali + sagitta). */
export function arcApex(p1: Point, p2: Point, sagitta: number): Point {
  const c = chordLength(p1, p2);
  if (c < 1e-9) return { ...p1 };
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const nx = -(p2.y - p1.y) / c;
  const ny = (p2.x - p1.x) / c;
  return { x: mx + nx * sagitta, y: my + ny * sagitta };
}

/** Path busur untuk potongan bukaan [s0,s1] (jarak busur dari p1).
 * Rp dihitung dari radius lingkaran (R dunia → px) agar sejajar dinding. */
export function arcSegmentPath(a: Point, b: Point, sagitta: number, s0: number, s1: number, toScreen: (p: Point) => Point): string {
  const A = toScreen(pointAtArcDistance(a, b, sagitta, s0));
  const B = toScreen(pointAtArcDistance(a, b, sagitta, s1));
  if (!sagitta || Math.abs(sagitta) < 1e-9) return `M ${A.x} ${A.y} L ${B.x} ${B.y}`;
  const c = chordLength(a, b);
  const R = radiusFromSagitta(a, b, sagitta);
  if (!Number.isFinite(R) || R <= 0 || c < 1e-9) return `M ${A.x} ${A.y} L ${B.x} ${B.y}`;
  // Skala dunia→layar dari tali (asumsi seragam).
  const aS = toScreen(a); const bS = toScreen(b);
  const worldChord = c;
  const pxChord = Math.hypot(bS.x - aS.x, bS.y - aS.y) || 1;
  const k = pxChord / worldChord;
  const Rp = R * k;
  const span = arcSpanForWidth(a, b, sagitta, Math.abs(s1 - s0));
  const largeArc = span > Math.PI ? 1 : 0;
  const sweep = sagitta > 0 ? 0 : 1;
  return `M ${A.x} ${A.y} A ${Rp} ${Rp} 0 ${largeArc} ${sweep} ${B.x} ${B.y}`;
}

/** Daun pintu melengkung: garis dari ujung bukaan mengikuti singgung + ayunan swing. */
export function doorLeafPath(a: Point, b: Point, sagitta: number, hingeS: number, width: number, swing: 1 | -1, toScreen: (p: Point) => Point): string {
  const curved = sagitta && Math.abs(sagitta) >= 1e-9;
  if (!curved) {
    const p1 = a; const p2 = b;
    const c = chordLength(p1, p2) || 1;
    const dx = (p2.x - p1.x) / c; const dy = (p2.y - p1.y) / c;
    const hx = p1.x + dx * hingeS; const hy = p1.y + dy * hingeS;
    const px = -dy * swing; const py = dx * swing;
    const ex = hx + dx * width * 0.9 + px * width * 0.55;
    const ey = hy + dy * width * 0.9 + py * width * 0.55;
    const H = toScreen({ x: hx, y: hy }); const E = toScreen({ x: ex, y: ey });
    return `M ${H.x} ${H.y} L ${E.x} ${E.y}`;
  }
  const hinge = pointAtArcDistance(a, b, sagitta, hingeS);
  const tan = tangentAtArcDistance(a, b, sagitta, hingeS);
  const px = -tan.y * swing; const py = tan.x * swing;
  const ex = hinge.x + tan.x * width * 0.9 + px * width * 0.55;
  const ey = hinge.y + tan.y * width * 0.9 + py * width * 0.55;
  const H = toScreen(hinge); const E = toScreen({ x: ex, y: ey });
  return `M ${H.x} ${H.y} L ${E.x} ${E.y}`;
}

/** Path SVG busur lewat titik-titik layar (flag sweep mengikuti tanda sagitta). */
export function arcPath(p1: Point, p2: Point, sagitta: number, toScreen: (p: Point) => Point): string {
  const a = toScreen(p1);
  const b = toScreen(p2);
  if (!sagitta || Math.abs(sagitta) < 1e-9) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const c = chordLength(p1, p2);
  const R = radiusFromSagitta(p1, p2, sagitta);
  if (!Number.isFinite(R) || R <= 0 || c < 1e-9) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const chordPx = Math.hypot(b.x - a.x, b.y - a.y);
  const Rp = (R * chordPx) / c;
  const theta = 2 * Math.asin(Math.min(1, (c / 2) / R));
  const largeArc = theta > Math.PI ? 1 : 0;
  // Puncak busur = tengah tali + n*sagitta (n = normal kiri arah p1→p2 dalam
  // koordinat kanvas); sweep dipilih agar busur melewati puncak tersebut.
  const sweep = sagitta > 0 ? 0 : 1;
  return `M ${a.x} ${a.y} A ${Rp} ${Rp} 0 ${largeArc} ${sweep} ${b.x} ${b.y}`;
}

/** Jarak titik ke busur (proyeksi radial bila dalam rentang sudut, ujung bila di luar). */
export function distancePointToArc(p: Point, a: Point, b: Point, sagitta: number): number {
  if (!sagitta || Math.abs(sagitta) < 1e-9) return distancePointToSegment(p, a, b);
  const center = arcCenter(a, b, sagitta);
  if (!center) return distancePointToSegment(p, a, b);
  const R = radiusFromSagitta(a, b, sagitta);
  const radial = Math.abs(distance(p, center) - R);
  const norm = (t: number) => {
    while (t < 0) t += Math.PI * 2;
    while (t >= Math.PI * 2) t -= Math.PI * 2;
    return t;
  };
  // Busur dari a ke b: tanda sagitta menentukan arah putaran.
  // sagitta > 0 (tonjolan kiri arah a→b) = putaran CCW di koordinat dunia y-ke-atas.
  const ccw = sagitta < 0;
  const a1 = norm(Math.atan2(a.y - center.y, a.x - center.x));
  const a2 = norm(Math.atan2(b.y - center.y, b.x - center.x));
  const ap = norm(Math.atan2(p.y - center.y, p.x - center.x));
  const span = ccw ? norm(a2 - a1) : norm(a1 - a2);
  const rel = ccw ? norm(ap - a1) : norm(a1 - ap);
  if (rel <= span) return radial;
  return Math.min(distance(p, a), distance(p, b));
}

/** Titik pada busur pada jarak s meter dari p1 (untuk bukaan pintu/jendela). */
export function pointAtArcDistance(a: Point, b: Point, sagitta: number, s: number): Point {
  const c = chordLength(a, b);
  if (!sagitta || Math.abs(sagitta) < 1e-9 || c < 1e-9) {
    const t = Math.max(0, Math.min(1, s / Math.max(1e-9, c)));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const R = radiusFromSagitta(a, b, sagitta);
  const center = arcCenter(a, b, sagitta);
  if (!center || !Number.isFinite(R)) return { ...a };
  const startAng = Math.atan2(a.y - center.y, a.x - center.x);
  let delta = Math.atan2(b.y - center.y, b.x - center.x) - startAng;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const total = Math.abs(R * delta);
  const t = Math.max(0, Math.min(1, s / Math.max(1e-9, total)));
  const ang = startAng + delta * t;
  return { x: center.x + R * Math.cos(ang), y: center.y + R * Math.sin(ang) };
}

/** Arah singgung busur (vektor satuan) pada jarak s meter dari p1. */
export function tangentAtArcDistance(a: Point, b: Point, sagitta: number, s: number): Point {
  const c = chordLength(a, b);
  if (!sagitta || Math.abs(sagitta) < 1e-9 || c < 1e-9) {
    const t = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / t, y: (b.y - a.y) / t };
  }
  const R = radiusFromSagitta(a, b, sagitta);
  const center = arcCenter(a, b, sagitta);
  if (!center || !Number.isFinite(R) || R < 1e-9) {
    const t = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / t, y: (b.y - a.y) / t };
  }
  const startAng = Math.atan2(a.y - center.y, a.x - center.x);
  let delta = Math.atan2(b.y - center.y, b.x - center.x) - startAng;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const total = Math.abs(R * delta);
  const t = Math.max(0, Math.min(1, s / Math.max(1e-9, total)));
  const ang = startAng + delta * t;
  const dir = delta >= 0 ? 1 : -1;
  return { x: -Math.sin(ang) * dir, y: Math.cos(ang) * dir };
}

/** Sudut busur (radian) yang ditempati lebar bukaan w pada jarak s dari p1. */
export function arcSpanForWidth(a: Point, b: Point, sagitta: number, width: number): number {
  if (!sagitta || Math.abs(sagitta) < 1e-9) return 0;
  const R = radiusFromSagitta(a, b, sagitta);
  if (!Number.isFinite(R) || R < 1e-9) return 0;
  return Math.max(0, Math.min(Math.PI, width / R));
}

/** Panjang efektif dinding: busur bila melengkung, tali bila lurus. */
export function effectiveWallLength(w: { p1: Point; p2: Point; arc_sagitta_m?: number }): number {
  const s = w.arc_sagitta_m || 0;
  if (!s || Math.abs(s) < 1e-9) return wallLength(w.p1, w.p2);
  return arcLength(w.p1, w.p2, s);
}
