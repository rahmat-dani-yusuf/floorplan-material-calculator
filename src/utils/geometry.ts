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

/** Geometri fillet sudut: titik singgung + sagitta busur dari sudut & radius. */
export function cornerFillet(
  corner: Point, dirA: Point, dirB: Point, radius: number,
): { t: number; turnAngle: number; trimA: Point; trimB: Point; arcMid: Point; sagitta: number } | null {
  const la = Math.hypot(dirA.x, dirA.y) || 1;
  const lb = Math.hypot(dirB.x, dirB.y) || 1;
  const ua = { x: dirA.x / la, y: dirA.y / la };
  const ub = { x: dirB.x / lb, y: dirB.y / lb };
  const dot = Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y));
  const angle = Math.acos(dot); // sudut belokan (0 = lurus, π = putar balik)
  if (!(angle > 1e-6) || !(angle < Math.PI - 1e-6)) return null;
  if (!(radius > 1e-9)) return null;
  const t = radius / Math.tan(angle / 2);
  if (!(t > 1e-9) || !Number.isFinite(t)) return null;
  const trimA = { x: corner.x + ua.x * t, y: corner.y + ua.y * t };
  const trimB = { x: corner.x + ub.x * t, y: corner.y + ub.y * t };
  // Garis bagi arah dalam (menjauhi sudut ke pusat lingkaran).
  let bx = ua.x + ub.x; let by = ua.y + ub.y;
  const bl = Math.hypot(bx, by);
  if (bl < 1e-9) return null;
  bx /= bl; by /= bl;
  const dist = radius / Math.sin(angle / 2);
  const center = { x: corner.x + bx * dist, y: corner.y + by * dist };
  // Puncak busur: titik lingkaran terdekat ke sudut, arah dari pusat ke sudut.
  const vx = corner.x - center.x; const vy = corner.y - center.y;
  const vl = Math.hypot(vx, vy) || 1;
  const arcMid = { x: center.x + (vx / vl) * radius, y: center.y + (vy / vl) * radius };
  // Sagitta bertanda: + bila busur menonjol ke kiri arah trimA→trimB.
  const mx = (trimA.x + trimB.x) / 2; const my = (trimA.y + trimB.y) / 2;
  const abx = trimB.x - trimA.x; const aby = trimB.y - trimA.y;
  const abl = Math.hypot(abx, aby) || 1;
  const nx = -aby / abl; const ny = abx / abl;
  const sagitta = (arcMid.x - mx) * nx + (arcMid.y - my) * ny;
  return { t, turnAngle: angle, trimA, trimB, arcMid, sagitta };
}

/** Cari sudut tajam: titik yang dipakai tepat 2 dinding lurus (bukan pertigaan). */
export function findSharpCorner(
  walls: { id: string; p1: Point; p2: Point; arc_sagitta_m?: number }[],
  pt: Point,
  tol = 0.001,
): { corner: Point; wallA: { id: string; p1: Point; p2: Point }; wallB: { id: string; p1: Point; p2: Point } } | null {
  const hits: { id: string; p1: Point; p2: Point }[] = [];
  for (const w of walls) {
    const s = w.arc_sagitta_m || 0;
    if (s && Math.abs(s) >= 1e-9) continue; // hanya sudut dari dinding lurus
    if (Math.hypot(pt.x - w.p1.x, pt.y - w.p1.y) <= tol || Math.hypot(pt.x - w.p2.x, pt.y - w.p2.y) <= tol) {
      hits.push(w);
    }
  }
  if (hits.length !== 2) return null;
  const [a, b] = hits;
  if (a.id === b.id) return null;
  return { corner: { ...pt }, wallA: a, wallB: b };
}

/** Cari busur fillet yang menghubungkan tepat dua dinding di titik potongnya. */
export function findCornerFillet(
  walls: { id: string; p1: Point; p2: Point; arc_sagitta_m?: number }[],
  tol = 0.02,
): { arcId: string; corner: Point; wallAId: string; wallBId: string } | null {
  for (const w of walls) {
    const s = w.arc_sagitta_m || 0;
    if (!s || Math.abs(s) < 1e-9) continue;
    // Ujung busur harus menempel tepat di badan dua dinding lain.
    const ends: { wallId: string; pt: Point }[] = [];
    for (const end of [w.p1, w.p2]) {
      const host = walls.find((o) => {
        if (o.id === w.id) return false;
        const os = o.arc_sagitta_m || 0;
        if (os && Math.abs(os) >= 1e-9) return false;
        return distancePointToSegment(end, o.p1, o.p2) <= tol;
      });
      if (!host) { ends.length = 0; break; }
      ends.push({ wallId: host.id, pt: end });
    }
    if (ends.length !== 2 || ends[0].wallId === ends[1].wallId) continue;
    const [ea, eb] = ends;
    const hostA = walls.find((x) => x.id === ea.wallId);
    const hostB = walls.find((x) => x.id === eb.wallId);
    if (!hostA || !hostB) continue;
    // Titik temu perpanjangan kedua dinding = sudut asal.
    const corner = lineIntersection(hostA.p1, hostA.p2, hostB.p1, hostB.p2);
    if (!corner) continue;
    // Sudut asal tidak boleh dipakai dinding lain (harus tinggal sisa potongan).
    const users = walls.filter((o) => {
      if (o.id === w.id) return false;
      return Math.hypot(corner.x - o.p1.x, corner.y - o.p1.y) <= tol
        || Math.hypot(corner.x - o.p2.x, corner.y - o.p2.y) <= tol;
    });
    if (users.length !== 0) continue;
    return { arcId: w.id, corner, wallAId: ea.wallId, wallBId: eb.wallId };
  }
  return null;
}

/** Titik temu dua garis (bukan segmen). Null bila sejajar. */
export function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x; const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x; const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  return { x: a1.x + d1x * t, y: a1.y + d1y * t };
}

/** Toleransi titik menempel pada kurva busur/tali (meter). */
export const ARC_ATTACH_TOL = 0.02;

/** Jarak titik ke kurva dinding (busur bila melengkung, tali bila lurus). */
export function distanceToCurve(p: Point, p1: Point, p2: Point, sagitta: number): number {
  if (!sagitta || Math.abs(sagitta) < 1e-9) return distancePointToSegment(p, p1, p2);
  return distancePointToArc(p, p1, p2, sagitta);
}

/** Proyeksikan titik ke kurva (busur/tali), dijepit dalam rentang kurva. */
export function projectPointToCurve(p: Point, p1: Point, p2: Point, sagitta: number): Point {
  const c = chordLength(p1, p2);
  if (!sagitta || Math.abs(sagitta) < 1e-9 || c < 1e-9) {
    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
    const ab2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / ab2));
    return { x: p1.x + dx * t, y: p1.y + dy * t };
  }
  const center = arcCenter(p1, p2, sagitta);
  const R = radiusFromSagitta(p1, p2, sagitta);
  if (!center || !Number.isFinite(R) || R < 1e-9) return { ...p1 };
  const vx = p.x - center.x; const vy = p.y - center.y;
  if (Math.hypot(vx, vy) < 1e-9) return arcApex(p1, p2, sagitta);
  const norm = (t: number) => {
    while (t < 0) t += Math.PI * 2;
    while (t >= Math.PI * 2) t -= Math.PI * 2;
    return t;
  };
  const ccw = sagitta < 0;
  const a1 = norm(Math.atan2(p1.y - center.y, p1.x - center.x));
  const a2 = norm(Math.atan2(p2.y - center.y, p2.x - center.x));
  const ap = norm(Math.atan2(vy, vx));
  const span = ccw ? norm(a2 - a1) : norm(a1 - a2);
  const rel = ccw ? norm(ap - a1) : norm(a1 - ap);
  let ang = ap;
  if (rel > span) {
    // Jepit ke ujung busur terdekat.
    const toStart = Math.min(rel, Math.PI * 2 - rel);
    const dEnd = Math.abs(rel - span);
    const toEnd = Math.min(dEnd, Math.PI * 2 - dEnd);
    ang = toStart <= toEnd ? a1 : a2;
  }
  return { x: center.x + R * Math.cos(ang), y: center.y + R * Math.sin(ang) };
}

/** Perpotongan sinar (origin + t·dir, t ≥ 0) dengan kurva. Null bila tak ada. */
export function intersectRayWithCurve(origin: Point, dir: Point, p1: Point, p2: Point, sagitta: number): Point | null {
  const curved = sagitta && Math.abs(sagitta) >= 1e-9;
  if (!curved) {
    const ex = p2.x - p1.x; const ey = p2.y - p1.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) < 1e-9) return null;
    const dx = p1.x - origin.x; const dy = p1.y - origin.y;
    const t = (dx * ey - dy * ex) / denom;
    const u = (dx * dir.y - dy * dir.x) / denom;
    if (t < -1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    const tt = Math.max(0, t);
    return { x: origin.x + dir.x * tt, y: origin.y + dir.y * tt };
  }
  const center = arcCenter(p1, p2, sagitta);
  const R = radiusFromSagitta(p1, p2, sagitta);
  if (!center || !Number.isFinite(R) || R < 1e-9) return null;
  const ox = origin.x - center.x; const oy = origin.y - center.y;
  const bq = ox * dir.x + oy * dir.y;
  const cq = ox * ox + oy * oy - R * R;
  const disc = bq * bq - cq;
  if (disc < 0) return null;
  const sq = Math.sqrt(Math.max(0, disc));
  const norm = (t: number) => {
    while (t < 0) t += Math.PI * 2;
    while (t >= Math.PI * 2) t -= Math.PI * 2;
    return t;
  };
  const ccw = sagitta < 0;
  const a1 = norm(Math.atan2(p1.y - center.y, p1.x - center.x));
  const a2 = norm(Math.atan2(p2.y - center.y, p2.x - center.x));
  const span = ccw ? norm(a2 - a1) : norm(a1 - a2);
  const cand = [-bq - sq, -bq + sq].filter((t) => t >= -1e-9).sort((x, y) => x - y);
  for (const t of cand) {
    const tt = Math.max(0, t);
    const px = origin.x + dir.x * tt;
    const py = origin.y + dir.y * tt;
    const ap = norm(Math.atan2(py - center.y, px - center.x));
    const rel = ccw ? norm(ap - a1) : norm(a1 - ap);
    if (rel <= span + 1e-9) return { x: px, y: py };
  }
  return null;
}

/** Cari dinding lengkung yang ditempeli titik (di busur, bukan di ujungnya). */
export function attachedArcForPoint(
  walls: { p1: Point; p2: Point; arc_sagitta_m?: number }[],
  pt: Point,
  tol = ARC_ATTACH_TOL,
): { p1: Point; p2: Point; arc_sagitta_m?: number } | null {
  for (const w of walls) {
    const s = w.arc_sagitta_m || 0;
    if (!s || Math.abs(s) < 1e-9) continue;
    if (normalizePointsEqual(pt, w.p1) || normalizePointsEqual(pt, w.p2)) continue;
    if (distancePointToArc(pt, w.p1, w.p2, s) <= tol) return w;
  }
  return null;
}
