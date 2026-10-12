// ===== LANGKAH 5: State management (Zustand) =====
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIMITS, DEFAULT_PINTU, DEFAULT_JENDELA } from '../constants/materials';
import { calcOpeningsArea } from '../utils/calculator';
import { MARGIN, MIN_GAP, findFreeOffset } from '../utils/openings';
import { wallLength, withSyncedLength, moveEndAlongDirection, normalizePointsEqual, snapToGrid, nearestPoint, distancePointToSegment, rectRoomWalls, lShapeRoomWalls, findFreeOrigin } from '../utils/geometry';
import type { BrickType, MortarRatio, Wall, Opening, Point, Room } from '../types';

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
      updated.length_meters = wallLength(updated.p1 || nextWalls[idx].p1, updated.p2 || nextWalls[idx].p2);
    }
    if (patch.length_meters != null) {
      // sync point when length changed directly via old action
      const w = nextWalls[idx];
      const dir = { x: w.p2.x - w.p1.x, y: w.p2.y - w.p1.y };
      const len = Math.hypot(dir.x, dir.y) || 1;
      const newDir = { x: (dir.x / len) * patch.length_meters, y: (dir.y / len) * patch.length_meters };
      updated.p2 = { x: w.p1.x + newDir.x, y: w.p1.y + newDir.y };
    }
    nextWalls[idx] = updated;
    if (JSON.stringify(nextWalls) === JSON.stringify(walls)) return;
    set({ walls: nextWalls, past: [...past, { walls, selectedId }].slice(-50), future: [] });
  };

  return {
    walls: [
      { ...DEFAULT_WALL, id: 'w-1', name: 'W-01', p1: { x: 0, y: 4 }, p2: { x: 5, y: 4 }, length_meters: 5 },
      { ...DEFAULT_WALL, id: 'w-2', name: 'W-02', p1: { x: 5, y: 4 }, p2: { x: 5, y: 0 }, length_meters: 4 },
      { ...DEFAULT_WALL, id: 'w-3', name: 'W-03', p1: { x: 5, y: 0 }, p2: { x: 0, y: 0 }, length_meters: 5 },
      { ...DEFAULT_WALL, id: 'w-4', name: 'W-04', p1: { x: 0, y: 0 }, p2: { x: 0, y: 4 }, length_meters: 4 },
    ],
    selectedId: DEFAULT_WALL.id,
    past: [],
    future: [],
    dedupeOverlap: true,
    rooms: [],
    toggleDedupe: () => set((s) => ({ dedupeOverlap: !s.dedupeOverlap })),
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
      const nextWalls = walls.map((mw) =>
        mw.id === selectedId ? { ...mw, p2: newP2, length_meters: len, openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: Math.max(MARGIN, Math.min(len - MARGIN, o.offset_meters)) })) } : mw,
      );
      // sync connected walls that share w.p2
      const updated = nextWalls.map((nw) => {
        if (nw.id !== selectedId && normalizePointsEqual(nw.p1, w.p2)) {
          return { ...nw, p1: newP2, length_meters: wallLength(newP2, nw.p2), openings: (nw.openings ?? []).map((o) => ({ ...o, offset_meters: Math.max(MARGIN, Math.min(nw.length_meters - MARGIN, o.offset_meters)) })) };
        }
        if (nw.id !== selectedId && normalizePointsEqual(nw.p2, w.p2)) {
          return { ...nw, p2: newP2, length_meters: wallLength(nw.p1, newP2), openings: (nw.openings ?? []).map((o) => ({ ...o, offset_meters: Math.max(MARGIN, Math.min(nw.length_meters - MARGIN, o.offset_meters)) })) };
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
        if (i === idx) return { ...mw, p2: newP2, length_meters: wallLength(w.p1, newP2), openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: Math.max(MARGIN, Math.min(wallLength(w.p1, newP2) - MARGIN, o.offset_meters)) })) };
        if (normalizePointsEqual(mw.p1, w.p2)) return { ...mw, p1: newP2, length_meters: wallLength(newP2, mw.p2), openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: Math.max(MARGIN, Math.min(wallLength(newP2, mw.p2) - MARGIN, o.offset_meters)) })) };
        if (normalizePointsEqual(mw.p2, w.p2)) return { ...mw, p2: newP2, length_meters: wallLength(mw.p1, newP2), openings: (mw.openings ?? []).map((o) => ({ ...o, offset_meters: Math.max(MARGIN, Math.min(wallLength(mw.p1, newP2) - MARGIN, o.offset_meters)) })) };
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
      const updated = walls.map((w) => {
        if (normalizePointsEqual(w.p1, oldPoint)) return { ...w, p1: newPoint, length_meters: wallLength(newPoint, w.p2) };
        if (normalizePointsEqual(w.p2, oldPoint)) return { ...w, p2: newPoint, length_meters: wallLength(w.p1, newPoint) };
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
        const clamped = Math.max(MARGIN, Math.min(w.length_meters - MARGIN, Math.round(offset * 20) / 20));
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

    reset: () => set({ walls: [
      { ...DEFAULT_WALL, id: 'w-1', name: 'W-01', p1: { x: 0, y: 4 }, p2: { x: 5, y: 4 }, length_meters: 5 },
      { ...DEFAULT_WALL, id: 'w-2', name: 'W-02', p1: { x: 5, y: 4 }, p2: { x: 5, y: 0 }, length_meters: 4 },
      { ...DEFAULT_WALL, id: 'w-3', name: 'W-03', p1: { x: 5, y: 0 }, p2: { x: 0, y: 0 }, length_meters: 5 },
      { ...DEFAULT_WALL, id: 'w-4', name: 'W-04', p1: { x: 0, y: 0 }, p2: { x: 0, y: 4 }, length_meters: 4 },
    ], selectedId: 'w-1', past: [], future: [] }),
  };
}, {
  name: 'floorplan-wall-draft-v2',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ walls: s.walls, selectedId: s.selectedId, dedupeOverlap: s.dedupeOverlap, rooms: s.rooms }),
  version: 3,
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
    return persistedState;
  },
}));

export const selectActiveWall = (s: WallStore) => s.walls.find((w) => w.id === s.selectedId) || s.walls[0];
export const selectArea = (s: WallStore) => {
  const w = s.walls.find((x) => x.id === s.selectedId) || s.walls[0];
  return w ? w.length_meters * w.height_meters : 0;
};
