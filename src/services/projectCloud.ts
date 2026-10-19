import { doc, collection, setDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { buildProjectSummary } from '../utils/pricing';
import { DEFAULT_PRICES } from '../constants/materials';

function sanitize(obj: any): any {
  if (Array.isArray(obj)) {
    const cleaned = obj.map(sanitize).filter((v) => v !== undefined);
    return cleaned;
  }
  if (obj !== null && typeof obj === 'object') {
    const res: any = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        const v = sanitize(obj[k]);
        if (v !== undefined) res[k] = v;
      }
    }
    return res;
  }
  return obj;
}

function computeRingkasan(walls: any[], dedupeOverlap?: boolean) {
  const s = buildProjectSummary(walls || [], DEFAULT_PRICES, { dedupeOverlap: !!dedupeOverlap });
  return {
    luasTotal: Math.round((s.total_area_m2 || 0) * 100) / 100,
    totalBiaya: Math.round(s.grand_total || 0),
    jumlahDinding: (walls || []).length,
    jumlahRuangan: 0,
  };
}

function allWalls(proyek: any): any[] {
  if (Array.isArray(proyek.floors) && proyek.floors.length > 0) {
    return proyek.floors.flatMap((f: any) => f.walls || []);
  }
  return proyek.walls || [];
}

function allRoomsCount(proyek: any): number {
  if (Array.isArray(proyek.floors) && proyek.floors.length > 0) {
    return proyek.floors.reduce((s: number, f: any) => s + ((f.rooms || []).length), 0);
  }
  return (proyek.rooms || []).length;
}

function parsePlan(parsed: any): { walls: any[]; rooms: any[]; dedupeOverlap: boolean; floors: any[]; activeFloorId?: string } {
  // Proyek lama (tanpa floors): migrasi otomatis menjadi 1 lantai.
  if (Array.isArray(parsed.floors) && parsed.floors.length > 0) {
    return {
      floors: parsed.floors,
      activeFloorId: parsed.activeFloorId || parsed.floors[0]?.id,
      walls: parsed.floors[0]?.walls || [],
      rooms: parsed.floors[0]?.rooms || [],
      dedupeOverlap: parsed.floors[0]?.dedupeOverlap ?? parsed.dedupeOverlap ?? true,
    };
  }
  const walls = parsed.walls || [];
  const rooms = parsed.rooms || [];
  return {
    walls,
    rooms,
    dedupeOverlap: parsed.dedupeOverlap ?? true,
    floors: [{ id: 'f-1', name: 'Lantai 1', height_meters: 3.2, walls, rooms, dedupeOverlap: parsed.dedupeOverlap ?? true }],
    activeFloorId: 'f-1',
  };
}

export async function simpanProyek(uid: string, proyek: any): Promise<void> {
  const id = proyek?.id || proyek?.projectId;
  if (!uid || !id) throw new Error('uid dan id proyek diperlukan');
  const floors = (proyek.floors || []).map((f: any) => sanitize(f));
  const walls = (floors.length > 0 ? floors.flatMap((f: any) => f.walls || []) : (proyek.walls || [])).map((w: any) => sanitize(w));
  const roomsCount = floors.length > 0 ? floors.reduce((s: number, f: any) => s + ((f.rooms || []).length), 0) : (proyek.rooms || []).length;
  const dedupeOverlap = proyek.dedupeOverlap ?? true;
  const ringkasanBase = computeRingkasan(walls, dedupeOverlap);
  ringkasanBase.jumlahRuangan = roomsCount;

  const payload = sanitize({
    id,
    nama: (proyek.name || proyek.nama || 'Proyek Baru').trim(),
    dibuatPada: proyek.createdAt || proyek.dibuatPada || Date.now(),
    diubahPada: proyek.updatedAt || proyek.diubahPada || Date.now(),
    ringkasan: ringkasanBase,
    planJson: JSON.stringify(sanitize({ walls, rooms: [], dedupeOverlap, floors, activeFloorId: proyek.activeFloorId, id, nama: proyek.name || proyek.nama, dibuatPada: proyek.createdAt || proyek.dibuatPada, diubahPada: proyek.updatedAt || proyek.diubahPada })),
  });

  const ref = doc(db, 'users', uid, 'projects', id);
  await setDoc(ref, payload, { merge: true });
}

export async function hapusProyek(uid: string, id: string): Promise<void> {
  if (!uid || !id) return;
  await deleteDoc(doc(db, 'users', uid, 'projects', id));
}

export function dengarkanProyek(uid: string, onData: (projects: any[]) => void, onError: (err: any) => void): () => void {
  const col = collection(db, 'users', uid, 'projects');
  const unsub = onSnapshot(col, (snap) => {
    const arr: any[] = [];
    snap.forEach((d) => {
      try {
        const data = d.data();
        const parsed = JSON.parse(data.planJson || '{}');
        const plan = parsePlan(parsed);
        arr.push({
          id: data.id || d.id,
          name: data.nama || parsed.nama || '',
          walls: plan.walls,
          rooms: plan.rooms,
          dedupeOverlap: plan.dedupeOverlap,
          floors: plan.floors,
          activeFloorId: plan.activeFloorId,
          createdAt: data.dibuatPada || parsed.dibuatPada || Date.now(),
          updatedAt: data.diubahPada || parsed.diubahPada || Date.now(),
        });
      } catch {
        // lewati dokumen rusak
      }
    });
    onData(arr);
  }, onError);
  return unsub;
}

export async function ambilSemuaProyek(uid: string): Promise<any[]> {
  if (!uid) return [];
  const snap = await getDocs(collection(db, 'users', uid, 'projects'));
  const arr: any[] = [];
  snap.forEach((d) => {
    try {
      const data = d.data();
      const parsed = JSON.parse(data.planJson || '{}');
      const plan = parsePlan(parsed);
      arr.push({
        id: data.id || d.id,
        name: data.nama || parsed.nama || '',
        walls: plan.walls,
        rooms: plan.rooms,
        dedupeOverlap: plan.dedupeOverlap,
        floors: plan.floors,
        activeFloorId: plan.activeFloorId,
        createdAt: data.dibuatPada || parsed.dibuatPada || Date.now(),
        updatedAt: data.diubahPada || parsed.diubahPada || Date.now(),
      });
    } catch {
      // lewati dokumen rusak
    }
  });
  return arr;
}
