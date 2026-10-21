// ===== LANGKAH 5: State management (Zustand) =====
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIMITS, DEFAULT_PINTU, DEFAULT_JENDELA } from '../constants/materials';
import { calcOpeningsArea } from '../utils/calculator';
import { MARGIN, MIN_GAP, findFreeOffset } from '../utils/openings';
import { wallLength, moveEndAlongDirection, normalizePointsEqual, rectRoomWalls, lShapeRoomWalls, findFreeOrigin, arcLength, sagittaFromRadius, minRadius, effectiveWallLength, distancePointToSegment, distancePointToArc, intersectRayWithCurve, projectPointToCurve, attachedArcForPoint, ARC_ATTACH_TOL, cornerFillet, findSharpCorner, findCornerFillet, lineIntersection } from '../utils/geometry';
import type { BrickType, MortarRatio, Wall, Opening, Point, Room, Floor } from '../types';
import { defaultFloor } from '../types';
import { clampOffset } from '../utils/openings';

export const DEFAULT_WALL: Wall = {
  id: 'w-1',
  name: 'W-01',
  p1: { x: 0, y: 4 },
  p2: { x: 5, y: 4 },
  length_meters: 5,
  height_meters: 3.2,
  brick_type: 'bata_merah',
  mortar_ratio: '1:4',
  openings: [],
};

const clamp = (n: number) =>
  Math.min(LIMITS.max, Math.max(LIMITS.min, Math.round(n * 100) / 100));

// offset bukaan = jarak sepanjang BUSUR dari p1. Saat panjang berubah
// (lurus↔lengkung / kelengkungan berubah), pertahankan posisi relatif
// (proporsi offset/panjang) lalu clamp ke batas busur.
function rescaleOpenings(oldLen: number, next: Wall): Wall {
  if (!next.openings || next.openings.length === 0) return next;
  const newLen = effectiveWallLength(next);
  const t = (oldLen > 1e-9 && newLen > 1e-9) ? newLen / oldLen : 1;
  const openings = next.openings.map((o) => ({ ...o, offset_meters: clampOffset(next, o, o.offset_meters * t) }));
  return { ...next, openings };
}

/** Geser offset bukaan sejauh d (tanda + menjauhi p1). Untuk ujung p1 yang
 * dipotong: posisi dunia ujung bukaan dipertahankan, bukan sekadar di-clamp. */
function shiftOpenings(w: Wall, d: number): Wall {
  if (!w.openings || w.openings.length === 0 || Math.abs(d) < 1e-9) return w;
  const openings = w.openings.map((o) => ({ ...o, offset_meters: clampOffset(w, o, o.offset_meters - d) }));
  return { ...w, openings };
}

/** Clamp offset bukaan ke batas dinding (panjang busur bila lengkung). */
function clampOpeningOffset(w: Wall, o: Opening, offset: number): number {
  const len = effectiveWallLength(w);
  const half = o.width_meters / 2;
  return Math.max(MARGIN + half, Math.min(len - MARGIN - half, offset));
}

/** Titik ujung dinding lain yang menempel di kurva dinding acuan (toleransi ~0,02 m). */
function findCurveAttachments(walls: Wall[], arcWall: Wall, tol = ARC_ATTACH_TOL): { point: Point; wall: Wall; end: 'p1' | 'p2' }[] {
  const s = arcWall.arc_sagitta_m || 0;
  const curved = Math.abs(s) >= 1e-9;
  const out: { point: Point; wall: Wall; end: 'p1' | 'p2' }[] = [];
  for (const w of walls) {
    if (w.id === arcWall.id) continue;
    for (const end of ['p1', 'p2'] as const) {
      const pt = w[end];
      // Ujung-ujung busur itu sendiri bukan tempelan.
      if (normalizePointsEqual(pt, arcWall.p1) || normalizePointsEqual(pt, arcWall.p2)) continue;
      const d = curved
        ? distancePointToArc(pt, arcWall.p1, arcWall.p2, s)
        : distancePointToSegment(pt, arcWall.p1, arcWall.p2);
      if (d > tol) continue;
      // Harus berada dalam rentang kurva (bukan perpanjangan garis).
      const c = Math.hypot(arcWall.p2.x - arcWall.p1.x, arcWall.p2.y - arcWall.p1.y);
      if (c > 1e-9) {
        const dx = arcWall.p2.x - arcWall.p1.x; const dy = arcWall.p2.y - arcWall.p1.y;
        const t = ((pt.x - arcWall.p1.x) * dx + (pt.y - arcWall.p1.y) * dy) / (c * c);
        if (t < -1e-6 || t > 1 + 1e-6) continue;
      }
      if (out.some((o) => o.wall.id === w.id && o.end === end)) continue;
      out.push({ point: { ...pt }, wall: w, end });
    }
  }
  return out;
}

/** Geser titik-titik tempelan ke kurva baru (perpotongan sinar, fallback proyeksi).
 * Semua dinding yang berbagi titik lama ikut bergeser (seperti moveVertex),
 * panjang diperbarui, dan proporsi bukaan dipertahankan. */
function reattachNeighbors(nextWalls: Wall[], arcWall: Wall, atts: { point: Point; wall: Wall; end: 'p1' | 'p2' }[]): Wall[] {
  if (atts.length === 0) return nextWalls;
  const s = arcWall.arc_sagitta_m || 0;
  const oldToNew: { oldPt: Point; newPt: Point }[] = [];
  for (const a of atts) {
    if (oldToNew.some((m) => normalizePointsEqual(m.oldPt, a.point))) continue;
    const cur = nextWalls.find((x) => x.id === a.wall.id);
    if (!cur) continue;
    // Ujung lawan yang tidak berubah menentukan arah garis dinding tetangga.
    const anchor = a.end === 'p1' ? cur.p2 : cur.p1;
    const dx = a.point.x - anchor.x; const dy = a.point.y - anchor.y;
    const dl = Math.hypot(dx, dy);
    let target: Point | null = null;
    if (dl > 1e-9) {
      target = intersectRayWithCurve(anchor, { x: dx / dl, y: dy / dl }, arcWall.p1, arcWall.p2, s)
        ?? intersectRayWithCurve(anchor, { x: -dx / dl, y: -dy / dl }, arcWall.p1, arcWall.p2, s);
    }
    if (!target) target = projectPointToCurve(a.point, arcWall.p1, arcWall.p2, s);
    oldToNew.push({
      oldPt: { ...a.point },
      newPt: { x: Math.round(target.x * 100) / 100, y: Math.round(target.y * 100) / 100 },
    });
  }
  if (oldToNew.length === 0) return nextWalls;
  return nextWalls.map((w) => {
    if (w.id === arcWall.id) return w;
    let nw = w;
    let changed = false;
    for (const end of ['p1', 'p2'] as const) {
      const m = oldToNew.find((x) => normalizePointsEqual(nw[end], x.oldPt));
      if (m && !normalizePointsEqual(nw[end], m.newPt)) {
        nw = end === 'p1' ? { ...nw, p1: { ...m.newPt } } : { ...nw, p2: { ...m.newPt } };
        changed = true;
      }
    }
    if (!changed) return w;
    const withLen = { ...nw, length_meters: effectiveWallLength(nw) };
    return rescaleOpenings(w.length_meters, withLen);
  });
}

interface Snapshot {
  walls: Wall[];
  selectedId: string;
}

interface WallStore {
  walls: Wall[];
  selectedId: string;
  past: Snapshot[];
  future: Snapshot[];
  dedupeOverlap: boolean;
  rooms: Room[];
  floors: Floor[];
  activeFloorId: string | null;
  addWall: () => void;
  removeWall: (id: string) => void;
  selectWall: (id: string) => void;
  setLength: (m: number) => void;
  setWallLength: (id: string, m: number) => void;
  addWallAt: (p1: Point, p2: Point) => void;
  moveVertex: (oldPoint: Point, newPoint: Point) => void;
  setHeight: (m: number) => void;
  stepLength: (delta: number) => void;
  stepHeight: (delta: number) => void;
  setBrickType: (b: BrickType) => void;
  setMortarRatio: (r: MortarRatio) => void;
  loadWalls: (walls: Wall[]) => void;
  addRoom: (shape: 'persegi' | 'L', params: Record<string, number>, options?: { replace?: boolean }) => void;
  loadPlan: (walls: { p1: Point; p2: Point }[], replace: boolean) => void;
  addOpening: (wallId: string, type: 'pintu' | 'jendela') => boolean;
  updateOpening: (wallId: string, openingId: string, patch: Partial<Omit<Opening, 'id' | 'type'>>) => void;
  moveOpening: (wallId: string, openingId: string, offset: number) => void;
  flipOpening: (wallId: string, openingId: string) => void;
  removeOpening: (wallId: string, openingId: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  toggleDedupe: () => void;
  setRooms: (rooms: Room[]) => void;
  setActiveFloor: (id: string) => void;
  addFloor: (options?: { copyFromBelow?: boolean }) => void;
  removeFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;
  setFloorHeight: (id: string, h: number) => void;
  loadFloors: (floors: Floor[], activeFloorId?: string | null) => void;
  toggleArc: (id: string, curved: boolean) => void;
  setArcRadius: (id: string, radius: number) => boolean;
  setArcSagitta: (id: string, sagitta: number) => void;
  flipArc: (id: string) => void;
  roundCorner: (point: Point, radius: number) => { ok: true } | { ok: false; reason: string };
  unroundCorner: () => { ok: true } | { ok: false; reason: string };
  rapikanSudut: () => number;
  selectCorner: (p: Point | null) => void;
  clearCornerSelection: () => void;
  cornerPoint: Point | null;
}

export const useWallStore = create<WallStore>()(
  persist(
    (set, get) => {
  const commit = (patch: Partial<Wall>, sync = true) => {
    const { walls, selectedId, past } = get();
    const idx = walls.findIndex((w) => w.id === selectedId);
    if (idx === -1) return;
    const nextWalls = [...walls];
    const updated = { ...nextWalls[idx], ...patch };
    if (sync && (patch.p1 || patch.p2)) {
      updated.length_meters = effectiveWallLength(updated);
    }
    if (patch.length_meters != null) {
      // sync point when length changed directly via old action
      const w = nextWalls[idx];
      const dir = { x: w.p2.x - w.p1.x, y: w.p2.y - w.p1.y };
      const len = Math.hypot(dir.x, dir.y) || 1;
      const newDir = { x: (dir.x / len) * patch.length_meters, y: (dir.y / len) * patch.length_meters };
      updated.p2 = { x: w.p1.x + newDir.x, y: w.p1.y + newDir.y };
    }
    nextWalls[idx] = rescaleOpenings(nextWalls[idx].length_meters, updated);
    if (JSON.stringify(nextWalls) === JSON.stringify(walls)) return;
    set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    syncActiveFloor();
  };

  const DEFAULT_FLOOR_WALLS: Wall[] = [
    { ...DEFAULT_WALL, id: 'w-1', name: 'W-01', p1: { x: 0, y: 4 }, p2: { x: 5, y: 4 }, length_meters: 5 },
    { ...DEFAULT_WALL, id: 'w-2', name: 'W-02', p1: { x: 5, y: 4 }, p2: { x: 5, y: 0 }, length_meters: 4 },
    { ...DEFAULT_WALL, id: 'w-3', name: 'W-03', p1: { x: 5, y: 0 }, p2: { x: 0, y: 0 }, length_meters: 5 },
    { ...DEFAULT_WALL, id: 'w-4', name: 'W-04', p1: { x: 0, y: 0 }, p2: { x: 0, y: 4 }, length_meters: 4 },
  ];
  const DEFAULT_FLOOR_ID = 'f-1';

  // Cermin lantai aktif: walls/rooms/dedupe di root selalu mencerminkan lantai
  // aktif, sehingga seluruh aksi lama (gambar, undo, snap, kalkulasi) tetap jalan
  // tanpa diubah. Setiap mutasi dinding/ruangan lalu disalin balik ke lantai aktif.
  const syncActiveFloor = () => {
    const st = get();
    const id = st.activeFloorId ?? DEFAULT_FLOOR_ID;
    const idx = st.floors.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const cur = st.floors[idx];
    if (JSON.stringify(cur.walls) === JSON.stringify(st.walls) &&
        JSON.stringify(cur.rooms ?? []) === JSON.stringify(st.rooms ?? []) &&
        (cur.dedupeOverlap ?? true) === st.dedupeOverlap) return;
    const next: Floor[] = [...st.floors];
    next[idx] = { ...cur, walls: st.walls, rooms: st.rooms, dedupeOverlap: st.dedupeOverlap };
    set({ floors: next });
  };

  const selectFloorWalls = (floors: Floor[], id: string | null) => {
    const f = floors.find((x) => x.id === id) ?? floors[0];
    return { floor: f, walls: f ? f.walls : [], rooms: f?.rooms ?? [], dedupe: f?.dedupeOverlap ?? true, id: f?.id ?? null };
  };

  // ----- Dinding melengkung: aksi tunggal (toggleArc / setArcRadius /
  // setArcSagitta / flipArc) ada di bawah. length_meters selalu = panjang busur.
  // Gabung undo geser busur: satu gesture slider/drag = satu langkah undo.
  let lastSagEditId: string | null = null;
  let lastSagEditAt = 0;

  return {
    
    walls: DEFAULT_FLOOR_WALLS.map((w) => ({ ...w })),
    selectedId: DEFAULT_WALL.id,
    past: [],
    future: [],
    dedupeOverlap: true,
    rooms: [],
    floors: [defaultFloor(DEFAULT_FLOOR_ID, 'Lantai 1', DEFAULT_FLOOR_WALLS.map((w) => ({ ...w })), [])],
    activeFloorId: DEFAULT_FLOOR_ID,
    cornerPoint: null,
    selectCorner: (p) => set({ cornerPoint: p ? { ...p } : null }),
    clearCornerSelection: () => set({ cornerPoint: null }),
    toggleDedupe: () => set((s) => ({ dedupeOverlap: !s.dedupeOverlap, floors: s.floors.map((f) => (f.id === (s.activeFloorId ?? 'f-1') ? { ...f, dedupeOverlap: !s.dedupeOverlap } : f)) })),
    setRooms: (rooms) => set({ rooms }),

    addWall: () => {
      const { walls, selectedId, past } = get();
      const active = walls.find((w) => w.id === selectedId) || walls[0];
      const maxNum = Math.max(
        ...walls.map((w) => {
          const m = w.name.match(/W-(\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        }),
        0,
      );
      const newName = `W-${String(maxNum + 1).padStart(2, '0')}`;
      const newWall: Wall = {
        ...active,
        id: `w-${Date.now()}`,
        name: newName,
      };
      set({
        walls: [...walls, newWall],
        selectedId: newWall.id,
        past: [...past, { walls, selectedId }].slice(-50),
        future: [],
      });
    },

    removeWall: (id) => {
      const { walls, selectedId, past } = get();
      if (walls.length <= 1) return;
      const nextWalls = walls.filter((w) => w.id !== id);
      const nextSelected = selectedId === id ? nextWalls[0].id : selectedId;
      set({
        walls: nextWalls,
        selectedId: nextSelected,
        past: [...past, { walls, selectedId }].slice(-50),
        future: [],
      });
    },

    selectWall: (id) => set({ selectedId: id }),

    setLength: (m) => {
      const { walls, selectedId } = get();
      const w = walls.find((x) => x.id === selectedId);
      if (!w) return;
      const newP2 = moveEndAlongDirection(w.p1, w.p2, m);
      const len = wallLength(w.p1, newP2);
      const nextWalls = walls.map((mw) => {
        if (mw.id !== selectedId) return mw;
        const nw = { ...mw, p2: newP2, length_meters: len };
        return { ...nw, openings: (nw.openings ?? []).map((o) => ({ ...o, offset_meters: clampOpeningOffset(nw, o, o.offset_meters) })) };
      });
      // sync connected walls that share w.p2
      const updated = nextWalls.map((nw) => {
        if (nw.id !== selectedId && normalizePointsEqual(nw.p1, w.p2)) {
          return { ...nw, p1: newP2, length_meters: wallLength(newP2, nw.p2), openings: (nw.openings ?? []).map((o) => { const nnw = { ...nw, p1: newP2, length_meters: wallLength(newP2, nw.p2) }; return { ...o, offset_meters: clampOpeningOffset(nnw, o, o.offset_meters) }; }) };
        }
        if (nw.id !== selectedId && normalizePointsEqual(nw.p2, w.p2)) {
          return { ...nw, p2: newP2, length_meters: wallLength(nw.p1, newP2), openings: (nw.openings ?? []).map((o) => { const nnw = { ...nw, p2: newP2, length_meters: wallLength(nw.p1, newP2) }; return { ...o, offset_meters: clampOpeningOffset(nnw, o, o.offset_meters) }; }) };
        }
        return nw;
      });
      set({ walls: updated, past: [...get().past, { walls, selectedId }].slice(-50), future: [] });
    },
    setWallLength: (id, m) => {
      const { walls, past, selectedId } = get();
      const idx = walls.findIndex((w) => w.id === id);
      if (idx === -1) return;
      const w = walls[idx];
      const newP2 = moveEndAlongDirection(w.p1, w.p2, m);
      const nextWalls = walls.map((mw, i) => {
        if (i === idx) { const nnw = { ...mw, p2: newP2, length_meters: wallLength(w.p1, newP2) }; return { ...nnw, openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: clampOpeningOffset(nnw, o, o.offset_meters) })) }; }
        if (normalizePointsEqual(mw.p1, w.p2)) { const nnw = { ...mw, p1: newP2, length_meters: wallLength(newP2, mw.p2) }; return { ...nnw, openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: clampOpeningOffset(nnw, o, o.offset_meters) })) }; }
        if (normalizePointsEqual(mw.p2, w.p2)) { const nnw = { ...mw, p2: newP2, length_meters: wallLength(mw.p1, newP2) }; return { ...nnw, openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: clampOpeningOffset(nnw, o, o.offset_meters) })) }; }
        return mw;
      });
      set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },
    setHeight: (m) => Number.isFinite(m) && commit({ height_meters: clamp(m) }),
    stepLength: (d) => {
      const { walls, selectedId } = get();
      const w = walls.find((x) => x.id === selectedId);
      if (!w) return;
      const newP2 = moveEndAlongDirection(w.p1, w.p2, Math.max(0.1, w.length_meters + d));
      const nextWalls = walls.map((mw) =>
        mw.id === selectedId ? { ...mw, p2: newP2, length_meters: wallLength(w.p1, newP2) } : mw,
      );
      set({ walls: nextWalls, past: [...get().past, { walls, selectedId }].slice(-50), future: [] });
    },
    stepHeight: (d) => {
      const { walls, selectedId } = get();
      const w = walls.find((x) => x.id === selectedId);
      if (!w) return;
      commit({ height_meters: clamp(w.height_meters + d) });
    },
    setBrickType: (brick_type) => commit({ brick_type }),
    setMortarRatio: (mortar_ratio) => commit({ mortar_ratio }),
    loadWalls: (walls: Wall[]) => {
      set({ walls, selectedId: walls[0]?.id ?? DEFAULT_WALL.id, past: [], future: [] });
    },

    addRoom: (shape, params, options) => {
      const { walls, selectedId, past } = get();
      const active = walls.find((w) => w.id === selectedId) || walls[0];
      const origin = findFreeOrigin(walls, 1);
      let segments: { p1: Point; p2: Point }[] = [];
      if (shape === 'persegi') {
        const w = params.width ?? 3;
        const l = params.length ?? 3;
        segments = rectRoomWalls(origin, w, l).map((s) => ({ p1: s.p1, p2: s.p2 }));
      } else if (shape === 'L') {
        const w = params.width ?? 4;
        const l = params.length ?? 5;
        const cw = params.cutW ?? 2;
        const cl = params.cutL ?? 2;
        segments = lShapeRoomWalls(origin, w, l, cw, cl).map((s) => ({ p1: s.p1, p2: s.p2 }));
      }
      const maxNum = Math.max(...walls.map((w) => { const m = w.name.match(/W-(\d+)/); return m ? parseInt(m[1], 10) : 0; }), 0);
      const newWalls: Wall[] = segments.map((seg, i) => ({
        ...active,
        id: `w-${Date.now()}-${i}`,
        name: `W-${String(maxNum + 1 + i).padStart(2, '0')}`,
        p1: seg.p1,
        p2: seg.p2,
        length_meters: wallLength(seg.p1, seg.p2),
      }));
      const nextWalls = options?.replace ? newWalls : [...walls, ...newWalls];
      set({ walls: nextWalls, selectedId: newWalls[0].id, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    loadPlan: (planWalls, replace) => {
      const { past, selectedId } = get();
      const mapped = planWalls.map((s) => ({
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `W-${String(Math.floor(Math.random()*1000)).padStart(2,'0')}`,
        p1: s.p1,
        p2: s.p2,
        length_meters: wallLength(s.p1, s.p2),
        height_meters: 3.2,
        brick_type: 'bata_merah' as const,
        mortar_ratio: '1:4' as const,
        openings: [],
      }));
      set({ walls: replace ? mapped : [...get().walls, ...mapped], selectedId: mapped[0]?.id ?? selectedId, past: replace ? [] : [...past, { walls: get().walls, selectedId }].slice(-50), future: [] });
    },

    addWallAt: (p1, p2) => {
      const { walls, selectedId, past } = get();
      const active = walls.find((w) => w.id === selectedId) || walls[0];
      const maxNum = Math.max(...walls.map((w) => { const m = w.name.match(/W-(\d+)/); return m ? parseInt(m[1], 10) : 0; }), 0);
      const newName = `W-${String(maxNum + 1).padStart(2, '0')}`;
      const len = wallLength(p1, p2);
      const newWall: Wall = {
        ...active,
        id: `w-${Date.now()}`,
        name: newName,
        p1,
        p2,
        length_meters: len,
      };
      set({ walls: [...walls, newWall], selectedId: newWall.id, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    moveVertex: (oldPoint, newPoint) => {
      const { walls, selectedId, past } = get();
      // Titik yang menempel di busur tidak boleh lepas: jepit geraknya sepanjang busur.
      const arc = attachedArcForPoint(walls, oldPoint);
      const target = arc ? projectPointToCurve(newPoint, arc.p1, arc.p2, arc.arc_sagitta_m || 0) : newPoint;
      const updated = walls.map((w) => {
        if (normalizePointsEqual(w.p1, oldPoint)) {
          const nw = { ...w, p1: target, length_meters: 0 };
          return { ...nw, length_meters: effectiveWallLength(nw) };
        }
        if (normalizePointsEqual(w.p2, oldPoint)) {
          const nw = { ...w, p2: target, length_meters: 0 };
          return { ...nw, length_meters: effectiveWallLength(nw) };
        }
        return w;
      });
      set({ walls: updated, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    addOpening: (wallId, type) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === wallId);
      if (idx === -1) return false;
      const w = walls[idx];
      const defaults = type === 'pintu' ? DEFAULT_PINTU : DEFAULT_JENDELA;
      const offset = findFreeOffset(w, defaults.width_meters, w.openings ?? []);
      if (offset === null) return false;
      const newOpening: Opening = {
        id: `o-${Date.now()}`,
        type,
        width_meters: defaults.width_meters,
        height_meters: defaults.height_meters,
        quantity: 1,
        offset_meters: offset,
        swing: 1,
      };
      const gross = w.length_meters * w.height_meters;
      const currentOpen = calcOpeningsArea(w.openings ?? []);
      const added = newOpening.width_meters * newOpening.height_meters * newOpening.quantity;
      if (currentOpen + added > gross + 0.001) {
        return false;
      }
      const nextWalls = [...walls];
      nextWalls[idx] = { ...nextWalls[idx], openings: [...(nextWalls[idx].openings ?? []), newOpening] };
      set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
      return true;
    },

    updateOpening: (wallId, openingId, patch) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === wallId);
      if (idx === -1) return;
      const w = walls[idx];
      const gross = w.length_meters * w.height_meters;
      const nextOpenings = (w.openings ?? []).map((o) =>
        o.id === openingId ? { ...o, ...patch } : o,
      );
      const openArea = calcOpeningsArea(nextOpenings);
      // jika melebihi, tetap simpan tapi akan tampilkan peringatan kuning di UI; di store kita izinkan
      const nextWalls = [...walls];
      nextWalls[idx] = { ...nextWalls[idx], openings: nextOpenings };
      set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    moveOpening: (wallId, openingId, offset) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === wallId);
      if (idx === -1) return;
      const w = walls[idx];
      const nextOpenings = (w.openings ?? []).map((o) => {
        if (o.id !== openingId) return o;
        // Batas offset memakai panjang BUSUR untuk dinding lengkung.
        const len = effectiveWallLength(w);
        const half = o.width_meters / 2;
        const clamped = Math.max(MARGIN + half, Math.min(len - MARGIN - half, Math.round(offset * 20) / 20));
        return { ...o, offset_meters: clamped };
      });
      const nextWalls = [...walls];
      nextWalls[idx] = { ...nextWalls[idx], openings: nextOpenings };
      set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    flipOpening: (wallId, openingId) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === wallId);
      if (idx === -1) return;
      const nextWalls = [...walls];
      nextWalls[idx] = { ...nextWalls[idx], openings: (nextWalls[idx].openings ?? []).map((o) => o.id === openingId ? { ...o, swing: (o.swing === 1 ? -1 : 1) as 1 | -1 } : o) };
      set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    removeOpening: (wallId, openingId) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === wallId);
      if (idx === -1) return;
      const w = walls[idx];
      const nextWalls = [...walls];
      nextWalls[idx] = { ...nextWalls[idx], openings: (w.openings ?? []).filter((o) => o.id !== openingId) };
      set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    undo: () => {
      const { past, walls, selectedId, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({
        walls: prev.walls,
        selectedId: prev.selectedId,
        past: past.slice(0, -1),
        future: [{ walls, selectedId }, ...future],
      });
    },

    redo: () => {
      const { future, walls, selectedId, past } = get();
      const next = future[0];
      if (!next) return;
      set({
        walls: next.walls,
        selectedId: next.selectedId,
        past: [...past, { walls, selectedId }],
        future: future.slice(1),
      });
    },

    reset: () => {
      const base = DEFAULT_FLOOR_WALLS.map((w) => ({ ...w, id: `${w.id}-${Date.now()}` }));
      const f = defaultFloor(DEFAULT_FLOOR_ID, 'Lantai 1', base, []);
      set({ floors: [f], activeFloorId: DEFAULT_FLOOR_ID, walls: base.map((w) => ({ ...w })), rooms: [], dedupeOverlap: true, selectedId: base[0]?.id ?? 'w-1', past: [], future: [], cornerPoint: null });
    },

    setActiveFloor: (id) => {
      const st = get();
      if (!st.floors.some((f) => f.id === id)) return;
      const { floor, walls, rooms, dedupe, id: fid } = selectFloorWalls(st.floors, id);
      if (!floor) return;
      set({ activeFloorId: fid, walls: walls.map((w) => ({ ...w })), rooms: (rooms ?? []).map((r) => ({ ...r })), dedupeOverlap: dedupe, selectedId: walls[0]?.id ?? st.selectedId, past: [], future: [], cornerPoint: null });
    },

    addFloor: (options) => {
      const st = get();
      const n = st.floors.length + 1;
      const now = Date.now();
      let walls: Wall[] = [];
      let rooms: Room[] = [];
      if (options?.copyFromBelow) {
        const idx = Math.max(0, st.floors.findIndex((f) => f.id === st.activeFloorId));
        const below = st.floors[idx] ?? st.floors[st.floors.length - 1];
        if (below) {
          walls = (below.walls ?? []).map((w, i) => ({
            ...w,
            id: `w-${now}-${i}`,
            openings: (w.openings ?? []).map((o, j) => ({ ...o, id: `o-${now}-${i}-${j}` })),
          }));
          rooms = (below.rooms ?? []).map((r, i) => ({ ...r, id: `r-${now}-${i}` }));
        }
      }
      const f = defaultFloor(`f-${now}`, `Lantai ${n}`, walls, rooms);
      const next = [...st.floors, f];
      set({ floors: next, activeFloorId: f.id, walls: walls.map((w) => ({ ...w })), rooms: rooms.map((r) => ({ ...r })), selectedId: walls[0]?.id ?? st.selectedId, past: [], future: [] });
    },

    removeFloor: (id) => {
      const st = get();
      if (st.floors.length <= 1) return;
      const next = st.floors.filter((f) => f.id !== id);
      const wasActive = st.activeFloorId === id;
      const { walls, rooms, dedupe, id: fid } = selectFloorWalls(next, wasActive ? next[next.length - 1]?.id ?? null : st.activeFloorId);
      set({ floors: next, activeFloorId: fid, walls: walls.map((w) => ({ ...w })), rooms: (rooms ?? []).map((r) => ({ ...r })), dedupeOverlap: dedupe, selectedId: walls[0]?.id ?? st.selectedId, past: [], future: [] });
    },

    renameFloor: (id, name) => {
      const st = get();
      set({ floors: st.floors.map((f) => (f.id === id ? { ...f, name } : f)) });
    },

    setFloorHeight: (id, h) => {
      const st = get();
      const v = Math.min(10, Math.max(2, Math.round(h * 100) / 100));
      if (!Number.isFinite(v)) return;
      set({ floors: st.floors.map((f) => (f.id === id ? { ...f, height_meters: v } : f)) });
    },

    loadFloors: (floors, activeFloorId) => {
      const list = (floors && floors.length > 0 ? floors : [defaultFloor(DEFAULT_FLOOR_ID, 'Lantai 1', [], [])])
        .map((f, i) => ({ ...f, id: f.id || `f-${i + 1}`, name: f.name || `Lantai ${i + 1}`, rooms: f.rooms ?? [], dedupeOverlap: f.dedupeOverlap ?? true }));
      const { walls, rooms, dedupe, id: fid } = selectFloorWalls(list, activeFloorId ?? null);
      set({ floors: list, activeFloorId: fid, walls: walls.map((w) => ({ ...w })), rooms: (rooms ?? []).map((r) => ({ ...r })), dedupeOverlap: dedupe, selectedId: walls[0]?.id ?? get().selectedId, past: [], future: [] });
    },

    // ===== Dinding melengkung =====
    // length_meters selalu = panjang busur (bukan tali) agar luas & RAB benar.
    toggleArc: (id, curved) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === id);
      if (idx === -1) return;
      const w = walls[idx];
      lastSagEditId = null;
      // Titik tempelan dicari di kurva LAMA sebelum perubahan.
      const atts = findCurveAttachments(walls, w);
      const nextWalls = [...walls];
      if (!curved) {
        nextWalls[idx] = rescaleOpenings(w.length_meters, { ...w, arc_sagitta_m: 0, length_meters: wallLength(w.p1, w.p2) });
      } else {
        const c = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
        const sag = Math.round((c * 0.15 + 0.1) * 100) / 100;
        nextWalls[idx] = rescaleOpenings(w.length_meters, { ...w, arc_sagitta_m: sag, length_meters: arcLength(w.p1, w.p2, sag) });
      }
      const out = reattachNeighbors(nextWalls, nextWalls[idx], atts);
      set({ walls: out, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    setArcRadius: (id, radius) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === id);
      if (idx === -1) return false;
      const w = walls[idx];
      // Validasi: radius minimum = setengah jarak antar ujung.
      const min = minRadius(w.p1, w.p2);
      if (!(radius >= min - 1e-9)) return false;
      const prev = w.arc_sagitta_m || 0;
      const sign = prev < 0 ? -1 : 1;
      const sag = sagittaFromRadius(w.p1, w.p2, radius);
      if (sag == null) return false;
      lastSagEditId = null;
      const atts = findCurveAttachments(walls, w);
      const nextWalls = [...walls];
      nextWalls[idx] = rescaleOpenings(w.length_meters, { ...w, arc_sagitta_m: Math.round(sign * sag * 100) / 100, length_meters: arcLength(w.p1, w.p2, sag) });
      const out = reattachNeighbors(nextWalls, nextWalls[idx], atts);
      set({ walls: out, past: [...past, { walls, selectedId }].slice(-50), future: [] });
      return true;
    },

    setArcSagitta: (id, sagitta) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === id);
      if (idx === -1) return;
      const w = walls[idx];
      const s = Math.round(sagitta * 100) / 100;
      // Gerakan beruntun (<800ms, id sama) digabung jadi satu entri undo.
      const now = Date.now();
      const merge = lastSagEditId === id && now - lastSagEditAt < 800;
      lastSagEditId = id;
      lastSagEditAt = now;
      const nextPast = merge ? past : [...past, { walls, selectedId }].slice(-50);
      // Seret handle/slider tetap live + satu undo (merge).
      // Tempelan dicari di kurva TERKINI (state terakhir), bukan snapshot lama,
      // agar titik yang sudah menempel di frame sebelumnya ikut terbawa.
      const curWall = get().walls[idx];
      const atts = findCurveAttachments(get().walls, merge && curWall ? curWall : w);
      if (Math.abs(s) < 0.01) {
        const nextWalls = [...walls];
        nextWalls[idx] = rescaleOpenings(w.length_meters, { ...w, arc_sagitta_m: 0, length_meters: wallLength(w.p1, w.p2) });
        const out = reattachNeighbors(nextWalls, nextWalls[idx], atts);
        set({ walls: out, past: nextPast, future: [] });
        return;
      }
      const nextWalls = [...walls];
      nextWalls[idx] = rescaleOpenings(w.length_meters, { ...w, arc_sagitta_m: s, length_meters: arcLength(w.p1, w.p2, s) });
      const out = reattachNeighbors(nextWalls, nextWalls[idx], atts);
      set({ walls: out, past: nextPast, future: [] });
    },

    flipArc: (id) => {
      const { walls, selectedId, past } = get();
      const idx = walls.findIndex((w) => w.id === id);
      if (idx === -1) return;
      const w = walls[idx];
      const s = -(w.arc_sagitta_m || 0);
      lastSagEditId = null;
      const atts = findCurveAttachments(walls, w);
      const nextWalls = [...walls];
      nextWalls[idx] = { ...w, arc_sagitta_m: s, length_meters: Math.abs(s) < 1e-9 ? wallLength(w.p1, w.p2) : arcLength(w.p1, w.p2, s) };
      const out = reattachNeighbors(nextWalls, nextWalls[idx], atts);
      set({ walls: out, past: [...past, { walls, selectedId }].slice(-50), future: [] });
    },

    roundCorner: (point, radius) => {
      const { walls, selectedId, past } = get();
      if (!(radius > 0)) return { ok: false as const, reason: 'Radius harus lebih dari 0.' };
      const sharp = findSharpCorner(walls, point);
      if (!sharp) return { ok: false as const, reason: 'Pilih titik sudut yang dipakai tepat dua dinding lurus.' };
      const fullA = walls.find((x) => x.id === sharp.wallA.id);
      const fullB = walls.find((x) => x.id === sharp.wallB.id);
      if (!fullA || !fullB) return { ok: false as const, reason: 'Dinding sudut tidak ditemukan.' };
      const corner = sharp.corner;
      const otherA = normalizePointsEqual(fullA.p1, corner) ? fullA.p2 : fullA.p1;
      const otherB = normalizePointsEqual(fullB.p1, corner) ? fullB.p2 : fullB.p1;
      const fillet = cornerFillet(corner, { x: otherA.x - corner.x, y: otherA.y - corner.y }, { x: otherB.x - corner.x, y: otherB.y - corner.y }, radius);
      if (!fillet) return { ok: false as const, reason: 'Sudut terlalu lurus atau berbalik untuk dibulatkan.' };
      const lenA = Math.hypot(otherA.x - corner.x, otherA.y - corner.y);
      const lenB = Math.hypot(otherB.x - corner.x, otherB.y - corner.y);
      if (fillet.t > lenA - 0.3 + 1e-9) return { ok: false as const, reason: `Radius terlalu besar untuk ${fullA.name} (sisa kurang dari 0,3 m).` };
      if (fillet.t > lenB - 0.3 + 1e-9) return { ok: false as const, reason: `Radius terlalu besar untuk ${fullB.name} (sisa kurang dari 0,3 m).` };
      for (const w of [fullA, fullB]) {
        const atCorner = normalizePointsEqual(w.p1, corner);
        for (const o of w.openings ?? []) {
          const half = o.width_meters / 2;
          const distCorner = atCorner ? o.offset_meters : w.length_meters - o.offset_meters;
          if (distCorner - half < fillet.t - 1e-9) {
            return { ok: false as const, reason: `Ada ${o.type === 'pintu' ? 'pintu' : 'jendela'} di ${w.name} yang terpotong. Geser dulu bukaannya.` };
          }
        }
      }
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const trimA = { x: r2(fillet.trimA.x), y: r2(fillet.trimA.y) };
      const trimB = { x: r2(fillet.trimB.x), y: r2(fillet.trimB.y) };
      const sag = r2(fillet.sagitta);
      const maxNum = Math.max(...walls.map((w) => { const m = w.name.match(/W-(\d+)/); return m ? parseInt(m[1], 10) : 0; }), 0);
      const arcId = `w-${Date.now()}-fillet`;
      const arcName = `W-${String(maxNum + 1).padStart(2, '0')}`;
      const nextWalls = walls.map((w) => {
        if (w.id === fullA.id) {
          const cutP1 = normalizePointsEqual(w.p1, corner);
          const nw = cutP1 ? { ...w, p1: trimA } : { ...w, p2: trimA };
          const sized = { ...nw, length_meters: wallLength(nw.p1, nw.p2) };
          // Ujung p1 dipotong sejauh t: offset bukaan digeser agar posisi dunia tetap.
          return cutP1 ? shiftOpenings(sized, fillet.t) : sized;
        }
        if (w.id === fullB.id) {
          const cutP1 = normalizePointsEqual(w.p1, corner);
          const nw = cutP1 ? { ...w, p1: trimB } : { ...w, p2: trimB };
          const sized = { ...nw, length_meters: wallLength(nw.p1, nw.p2) };
          return cutP1 ? shiftOpenings(sized, fillet.t) : sized;
        }
        return w;
      });
      const arcWall: Wall = {
        id: arcId, name: arcName, p1: trimA, p2: trimB,
        length_meters: arcLength(trimA, trimB, sag),
        height_meters: fullA.height_meters, brick_type: fullA.brick_type,
        mortar_ratio: fullA.mortar_ratio, openings: [], arc_sagitta_m: sag,
      };
      lastSagEditId = null;
      set({
        walls: [...nextWalls, arcWall], selectedId: arcId, cornerPoint: null,
        past: [...past, { walls, selectedId }].slice(-50), future: [],
      });
      return { ok: true as const };
    },

    unroundCorner: () => {
      const { walls, selectedId, past } = get();
      const fillet = findCornerFillet(walls);
      if (!fillet) return { ok: false as const, reason: 'Tidak ada sudut bulat yang bisa diluruskan.' };
      const arc = walls.find((w) => w.id === fillet.arcId);
      const hostA = walls.find((w) => w.id === fillet.wallAId);
      const hostB = walls.find((w) => w.id === fillet.wallBId);
      if (!arc || !hostA || !hostB) return { ok: false as const, reason: 'Dinding fillet tidak lengkap.' };
      const corner = fillet.corner;
      const pickEnd = (w: Wall): 'p1' | 'p2' => {
        const d1 = Math.hypot(w.p1.x - arc.p1.x, w.p1.y - arc.p1.y) + Math.hypot(w.p1.x - arc.p2.x, w.p1.y - arc.p2.y);
        const d2 = Math.hypot(w.p2.x - arc.p1.x, w.p2.y - arc.p1.y) + Math.hypot(w.p2.x - arc.p2.x, w.p2.y - arc.p2.y);
        return d1 <= d2 ? 'p1' : 'p2';
      };
      const nextWalls = walls
        .filter((w) => w.id !== arc.id)
        .map((w) => {
          if (w.id === hostA.id || w.id === hostB.id) {
            const end = pickEnd(w);
            const nw = end === 'p1' ? { ...w, p1: { ...corner } } : { ...w, p2: { ...corner } };
            return { ...nw, length_meters: wallLength(nw.p1, nw.p2) };
          }
          return w;
        });
      lastSagEditId = null;
      set({
        walls: nextWalls, selectedId: hostA.id, cornerPoint: null,
        past: [...past, { walls, selectedId }].slice(-50), future: [],
      });
      return { ok: true as const };
    },

    // Rapikan sudut: ujung dinding yang menggantung (dipakai satu dinding)
    // dirapikan ke dinding lain: (1) ke titik sambungan yang dipakai >= 2 dinding
    // bila berjarak <= 0,6 m; (2) jika tidak ada, ke titik potong garis dinding
    // dengan segmen dinding lain (trim/extend) bila jaraknya < 1,5 m.
    // Dinding lengkung diabaikan. Satu panggilan = satu langkah undo.
    rapikanSudut: () => {
      const { walls, selectedId, past } = get();
      const MAX_JOIN_DIST = 0.6;   // jangkauan titik sambungan (m)
      const MAX_TRIM_DIST = 1.5;   // jangkauan trim/extend (m)
      const SEG_TOL = 0.05;        // toleransi ujung segmen B (m)
      const EPS = 0.001;
      const MIN_LEN = 0.3;         // dinding A tidak boleh < 0,3 m
      let nextWalls = walls.map((w) => ({ ...w }));
      const movedEnds = new Set<string>();
      const bump = (wallId: string, end: 'p1' | 'p2') => {
        movedEnds.add(`${wallId}:${end}`);
      };
      const isCurved = (w: Wall) => !!w.arc_sagitta_m && Math.abs(w.arc_sagitta_m) >= 1e-9;

      for (let pass = 0; pass < 8; pass++) {
        // Kelompok titik ujung (hanya dinding lurus) + jumlah dinding pemakainya.
        type EndRef = { wallId: string; end: 'p1' | 'p2' };
        const groups: { pt: Point; wallIds: string[]; ends: EndRef[] }[] = [];
        for (const w of nextWalls) {
          if (isCurved(w)) continue;
          for (const end of ['p1', 'p2'] as const) {
            const pt = w[end];
            let g = groups.find((gg) => Math.abs(gg.pt.x - pt.x) < EPS && Math.abs(gg.pt.y - pt.y) < EPS);
            if (!g) { g = { pt: { x: pt.x, y: pt.y }, wallIds: [], ends: [] }; groups.push(g); }
            if (!g.wallIds.includes(w.id)) g.wallIds.push(w.id);
            g.ends.push({ wallId: w.id, end });
          }
        }
        // Titik sambungan: dipakai >= 2 dinding.
        const shared = groups.filter((g) => g.wallIds.length >= 2);
        let changed = false;

        for (const g of groups) {
          if (g.wallIds.length !== 1) continue; // bukan ujung menggantung
          const ref = g.ends[0];
          const idx = nextWalls.findIndex((x) => x.id === ref.wallId);
          if (idx === -1) continue;
          const cur = nextWalls[idx];
          const E = cur[ref.end];               // ujung yang digantung
          const O = ref.end === 'p1' ? cur.p2 : cur.p1; // ujung-other (acuan garis AO)

          // Kandidat tujuan: titik sambungan terdekat, atau titik potong garis AO
          // dengan segmen dinding lain (trim/extend).
          let best: Point | null = null;
          let bestD = Infinity;

          // (1) titik sambungan (dipakai >= 2 dinding) dalam 0,6 m
          for (const s of shared) {
            if (s.wallIds.includes(ref.wallId)) continue;
            const d = Math.hypot(s.pt.x - E.x, s.pt.y - E.y);
            if (d <= MAX_JOIN_DIST && d < bestD) { bestD = d; best = { x: s.pt.x, y: s.pt.y }; }
          }

          // (2) titik potong garis AO dengan segmen dinding lain B
          if (!best) {
            for (const B of nextWalls) {
              if (B.id === cur.id || isCurved(B)) continue;
              const X = lineIntersection(O, E, B.p1, B.p2);
              if (!X) continue;
              // X harus berada di segmen B (toleransi 0,05 m di ujungnya).
              const dSeg = distancePointToSegment(X, B.p1, B.p2);
              if (dSeg > SEG_TOL) continue;
              const dE = Math.hypot(X.x - E.x, X.y - E.y);
              if (dE >= MAX_TRIM_DIST) continue;
              if (dE < bestD) { bestD = dE; best = { x: X.x, y: X.y }; }
            }
          }

          if (!best || bestD < 1e-9) continue;
          // Jangan sampai ujung ini bertumpuk dengan ujung lawan (wall nol).
          if (Math.abs(O.x - best.x) < EPS && Math.abs(O.y - best.y) < EPS) continue;
          const nw = ref.end === 'p1' ? { ...cur, p1: best } : { ...cur, p2: best };
          if (wallLength(nw.p1, nw.p2) < MIN_LEN) continue;
          const oldLen = cur.length_meters;
          const sized = { ...nw, length_meters: wallLength(nw.p1, nw.p2) };
          // Proporsi posisi pintu/jendela dijaga saat panjang berubah.
          nextWalls[idx] = rescaleOpenings(oldLen, sized);
          bump(ref.wallId, ref.end);
          changed = true;
        }
        if (!changed) break;
      }

      if (movedEnds.size === 0) return 0;
      set({
        walls: nextWalls,
        past: [...past, { walls, selectedId }].slice(-50),
        future: [],
      });
      syncActiveFloor();
      return movedEnds.size;
    },
  };
}, {
  name: 'floorplan-wall-draft-v2',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ walls: s.walls, selectedId: s.selectedId, dedupeOverlap: s.dedupeOverlap, rooms: s.rooms, floors: s.floors, activeFloorId: s.activeFloorId }),
  version: 4,
  migrate: (persistedState: any, version: number) => {
    if (version < 2 && persistedState && Array.isArray(persistedState.walls)) {
      persistedState.walls = persistedState.walls.map((w: any, i: number) => {
        if (w.p1 && w.p2) return w as Wall;
        const len = w.length_meters || 5;
        return { ...w, p1: { x: 0, y: i * 1.5 }, p2: { x: len, y: i * 1.5 } };
      });
    }
    if (version < 3 && persistedState && Array.isArray(persistedState.walls)) {
      persistedState.walls = persistedState.walls.map((w: any) => {
        if (!Array.isArray(w.openings)) return w;
        const newOpenings: any[] = [];
        for (const o of w.openings) {
          const qty = o.quantity || 1;
          const base = { ...o, quantity: 1, offset_meters: 0, swing: 1 };
          const halfW = base.width_meters / 2;
          let startOff = MARGIN + halfW;
          for (let q = 0; q < qty; q++) {
            newOpenings.push({ ...base, id: `o-${Date.now()}-${q}-${o.id}`, offset_meters: Math.round(startOff * 100) / 100 });
            startOff += base.width_meters + MIN_GAP;
          }
        }
        return { ...w, openings: newOpenings };
      });
    }
    if (version < 4 && persistedState) {
      const rawFloors = Array.isArray((persistedState as any).floors) ? (persistedState as any).floors : null;
      if (rawFloors && rawFloors.length > 0) {
        (persistedState as any).activeFloorId = (persistedState as any).activeFloorId || rawFloors[0]?.id || 'f-1';
      } else {
        const walls = Array.isArray((persistedState as any).walls) ? (persistedState as any).walls : [];
        const rooms = Array.isArray((persistedState as any).rooms) ? (persistedState as any).rooms : [];
        const f = { id: 'f-1', name: 'Lantai 1', height_meters: 3.2, walls, rooms, dedupeOverlap: (persistedState as any).dedupeOverlap ?? true };
        (persistedState as any).floors = [f];
        (persistedState as any).activeFloorId = 'f-1';
      }
    }
    return persistedState;
  },
}));

export const selectActiveWall = (s: WallStore) => s.walls.find((w) => w.id === s.selectedId) || s.walls[0];
export const selectArea = (s: WallStore) => {
  const w = s.walls.find((x) => x.id === s.selectedId) || s.walls[0];
  return w ? w.length_meters * w.height_meters : 0;
};

/** Lantai di bawah lantai aktif (untuk ghost overlay di kanvas). */
export const selectFloorBelow = (s: WallStore): Floor | null => {
  const idx = s.floors.findIndex((f) => f.id === s.activeFloorId);
  if (idx > 0) return s.floors[idx - 1];
  return null;
};

// Sinkronisasi otomatis: setiap perubahan walls/rooms/dedupe di root disalin
// balik ke lantai aktif. Ini yang membuat seluruh aksi lama (gambar, undo,
// snap, kalkulasi) otomatis per-lantai tanpa mengubah tiap aksi satu per satu.
let syncingFloors = false;
useWallStore.subscribe((st, prev) => {
  if (syncingFloors) return;
  if (st.walls === prev.walls && st.rooms === prev.rooms && st.dedupeOverlap === prev.dedupeOverlap) return;
  const id = st.activeFloorId ?? 'f-1';
  const idx = st.floors.findIndex((f) => f.id === id);
  if (idx === -1) return;
  const cur = st.floors[idx];
  if (JSON.stringify(cur.walls) === JSON.stringify(st.walls) &&
      JSON.stringify(cur.rooms ?? []) === JSON.stringify(st.rooms ?? []) &&
      (cur.dedupeOverlap ?? true) === st.dedupeOverlap) return;
  syncingFloors = true;
  try {
    const next = [...st.floors];
    next[idx] = { ...cur, walls: st.walls, rooms: st.rooms, dedupeOverlap: st.dedupeOverlap };
    useWallStore.setState({ floors: next });
  } finally {
    syncingFloors = false;
  }
});
