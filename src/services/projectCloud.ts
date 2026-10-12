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

export async function simpanProyek(uid: string, proyek: any): Promise<void> {
  const id = proyek?.id || proyek?.projectId;
  if (!uid || !id) throw new Error('uid dan id proyek diperlukan');
  const walls = (proyek.walls || []).map((w: any) => sanitize(w));
  const rooms = (proyek.rooms || []).map((r: any) => sanitize(r));
  const dedupeOverlap = proyek.dedupeOverlap ?? true;
  const ringkasanBase = computeRingkasan(walls, dedupeOverlap);
  ringkasanBase.jumlahRuangan = rooms.length;

  const payload = sanitize({
    id,
    nama: (proyek.name || proyek.nama || 'Proyek Baru').trim(),
    dibuatPada: proyek.createdAt || proyek.dibuatPada || Date.now(),
    diubahPada: proyek.updatedAt || proyek.diubahPada || Date.now(),
    ringkasan: ringkasanBase,
    planJson: JSON.stringify(sanitize({ walls, rooms, dedupeOverlap, id, nama: proyek.name || proyek.nama, dibuatPada: proyek.createdAt || proyek.dibuatPada, diubahPada: proyek.updatedAt || proyek.diubahPada })),
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
        arr.push({
          id: data.id || d.id,
          name: data.nama || parsed.nama || '',
          walls: (parsed.walls || []),
          rooms: (parsed.rooms || []),
          dedupeOverlap: parsed.dedupeOverlap ?? true,
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
      arr.push({
        id: data.id || d.id,
        name: data.nama || parsed.nama || '',
        walls: (parsed.walls || []),
        rooms: (parsed.rooms || []),
        dedupeOverlap: parsed.dedupeOverlap ?? true,
        createdAt: data.dibuatPada || parsed.dibuatPada || Date.now(),
        updatedAt: data.diubahPada || parsed.diubahPada || Date.now(),
      });
    } catch {
      // lewati dokumen rusak
    }
  });
  return arr;
}
