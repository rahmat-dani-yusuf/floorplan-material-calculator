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
