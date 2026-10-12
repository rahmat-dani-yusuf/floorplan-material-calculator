import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Project, Wall } from '../types';
import { useWallStore } from './wallStore';
import { useAuthStore } from './authStore';
import { confirm } from '../utils/confirm';
import { simpanProyek, hapusProyek, dengarkanProyek, ambilSemuaProyek } from '../services/projectCloud';

export type SyncStatus = 'lokal' | 'menyinkronkan' | 'tersinkron' | 'offline' | 'galat';

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  syncStatus: SyncStatus;
  syncMessage: string;
  saveCurrentAs: (name: string) => void;
  saveCurrent: () => void;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  newProject: () => void;
  setSyncStatus: (status: SyncStatus, msg?: string) => void;
  flushPendingUploads: () => Promise<void>;
}

function buildUploadObj(project: any, isCurrent: boolean) {
  const wallState = useWallStore.getState();
  return {
    ...project,
    walls: isCurrent ? wallState.walls : (project.walls || []),
    rooms: isCurrent ? (wallState.rooms || []) : (project.rooms || []),
    dedupeOverlap: isCurrent ? (wallState.dedupeOverlap ?? project.dedupeOverlap ?? true) : (project.dedupeOverlap ?? true),
    updatedAt: Date.now(),
  };
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => {
      let pending: { uid: string; obj: any; timer: ReturnType<typeof setTimeout> }[] = [];

      const uploadDirect = (uid: string, obj: any) => {
        set({ syncStatus: 'menyinkronkan', syncMessage: '' });
        simpanProyek(uid, obj).then(() => {
          set({ syncStatus: 'tersinkron', syncMessage: '' });
        }).catch((e) => {
          console.warn('[sync]', e?.code || e?.message || e);
          set({ syncStatus: 'galat', syncMessage: String(e?.code || e?.message || e) });
        });
      };

      const uploadIfLogin = (project?: any) => {
        const auth = useAuthStore.getState();
        if (!auth.user || auth.isGuest) return;
        const uid = auth.user.uid;
        const proj = project || get().projects.find((p: any) => p.id === get().currentProjectId);
        if (!proj) return;
        const isCurrent = proj.id === get().currentProjectId;
        const obj = buildUploadObj(proj, isCurrent);
        // batalkan timer sebelumnya untuk objek sama (debounce perubahan beruntun)
        pending = pending.filter((p) => p.uid !== uid || p.obj !== obj); // simple drop by uid; keep minimal
        pending.forEach((p) => clearTimeout(p.timer));
        pending = [];
        const entry = { uid, obj, timer: setTimeout(() => {
          pending = pending.filter((p) => p !== entry);
          uploadDirect(uid, obj);
        }, 1500) };
        pending.push(entry);
      };

      const flushPendingUploads = () => new Promise<void>((resolve) => {
        const entries = pending.slice();
        pending = [];
        entries.forEach((e) => clearTimeout(e.timer));
        if (entries.length === 0) { resolve(); return; }
        set({ syncStatus: 'menyinkronkan', syncMessage: '' });
        Promise.allSettled(entries.map((e) => simpanProyek(e.uid, e.obj).catch((err) => { console.warn('[sync]', err?.code || err?.message || err); throw err; }))).then((results) => {
          const anyFailed = results.some((r) => r.status === 'rejected');
          if (anyFailed) set({ syncStatus: 'galat', syncMessage: 'Beberapa proyek gagal disinkronkan' });
          else set({ syncStatus: 'tersinkron', syncMessage: '' });
          resolve();
        });
      });

      return {
        projects: [],
        currentProjectId: null,
        syncStatus: 'lokal',
        syncMessage: '',
        setSyncStatus: (status, msg = '') => set({ syncStatus: status, syncMessage: msg }),
        saveCurrentAs: (name) => {
          const wallState = useWallStore.getState();
          const now = Date.now();
          const id = `p-${now}`;
          const project: any = {
            id,
            name: name.trim() || 'Proyek Baru',
            walls: wallState.walls,
            createdAt: now,
            updatedAt: now,
            rooms: wallState.rooms || [],
            dedupeOverlap: wallState.dedupeOverlap ?? true,
          };
          set((s) => ({
            projects: [...s.projects, project],
            currentProjectId: id,
          }));
          const auth = useAuthStore.getState();
          if (auth.user && !auth.isGuest) uploadDirect(auth.user.uid, buildUploadObj(project, true));
        },
        saveCurrent: () => {
          const { currentProjectId, projects } = get();
          if (!currentProjectId) return;
          const wallState = useWallStore.getState();
          set({
            projects: projects.map((p: any) =>
              p.id === currentProjectId ? { ...p, walls: wallState.walls, rooms: wallState.rooms || [], dedupeOverlap: wallState.dedupeOverlap ?? p.dedupeOverlap ?? true, updatedAt: Date.now() } : p
            ),
          });
          const proj = get().projects.find((p: any) => p.id === currentProjectId);
          if (proj) {
            const auth = useAuthStore.getState();
            if (auth.user && !auth.isGuest) uploadDirect(auth.user.uid, buildUploadObj(proj, true));
          }
        },
        openProject: (id) => {
          const { projects } = get();
          const proj = projects.find((p: any) => p.id === id);
          if (!proj) return;
          const walls = (proj.walls || []).map((w: any, i: number) => {
            if (w.p1 && w.p2) return w;
            const len = w.length_meters || 5;
            return { ...w, p1: { x: 0, y: i * 1.5 }, p2: { x: len, y: i * 1.5 }, length_meters: len };
          });
          const wallStore = useWallStore.getState();
          wallStore.loadWalls(walls);
          if (proj.dedupeOverlap != null && wallStore.dedupeOverlap !== proj.dedupeOverlap) {
            wallStore.toggleDedupe();
          }
          if ((proj as any).rooms && wallStore.rooms !== undefined) {
            // wallStore tidak memiliki setter langsung; biarkan room tetap lokal jika dibuka
          }
          set({ currentProjectId: id });
        },
        renameProject: (id, name) => {
          set((s) => ({
            projects: s.projects.map((p: any) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
          }));
          const proj = get().projects.find((p: any) => p.id === id);
          if (proj) uploadIfLogin({ ...proj, name: name.trim() || proj.name });
        },
        deleteProject: (id) => {
          const { currentProjectId } = get();
          set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            currentProjectId: currentProjectId === id ? null : currentProjectId,
          }));
          const auth = useAuthStore.getState();
          if (auth.user && !auth.isGuest) {
            hapusProyek(auth.user.uid, id).catch((e) => console.warn('[sync]', e?.code || e?.message || e));
          }
        },
        newProject: () => {
          const wallStore = useWallStore.getState();
          wallStore.reset();
          set({ currentProjectId: null });
        },
        flushPendingUploads,
      };
    },
    {
      name: 'floorplan-projects-v2',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version < 2 && persistedState && Array.isArray(persistedState.projects)) {
          persistedState.projects = persistedState.projects.map((proj: any) => {
            if (!Array.isArray(proj.walls)) return proj;
            proj.walls = proj.walls.map((w: any, i: number) => {
              if (w.p1 && w.p2) return w;
              const len = w.length_meters || 5;
              return { ...w, p1: { x: 0, y: i * 1.5 }, p2: { x: len, y: i * 1.5 }, length_meters: len };
            });
            return proj;
          });
        }
        if (version < 3 && persistedState && Array.isArray(persistedState.projects)) {
          const { MARGIN, MIN_GAP } = require('../utils/openings');
          persistedState.projects = persistedState.projects.map((proj: any) => {
            if (!Array.isArray(proj.walls)) return proj;
            proj.walls = proj.walls.map((w: any) => {
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
            return proj;
          });
        }
        return persistedState;
      },
    }
  )
);

let syncUnsub: (() => void) | null = null;

function startListener(uid: string) {
  if (syncUnsub) syncUnsub();
  useProjectStore.getState().setSyncStatus('menyinkronkan');
  syncUnsub = dengarkanProyek(uid, (cloudProjects: any[]) => {
    const current = useProjectStore.getState();
    const localMap = new Map(current.projects.map((p: any) => [p.id, p]));
    const cloudMap = new Map(cloudProjects.map((p: any) => [p.id, p]));
    const merged = [...current.projects];
    for (const cp of cloudProjects) {
      const idx = merged.findIndex((p: any) => p.id === cp.id);
      if (idx >= 0) {
        const lp = merged[idx];
        const cloudUpdated = cp.updatedAt || 0;
        const localUpdated = lp.updatedAt || 0;
        if (cloudUpdated > localUpdated) {
          merged[idx] = {
            ...lp,
            ...cp,
            walls: cp.walls || lp.walls,
            rooms: cp.rooms || lp.rooms,
            dedupeOverlap: cp.dedupeOverlap != null ? cp.dedupeOverlap : lp.dedupeOverlap,
            updatedAt: cloudUpdated,
            createdAt: cp.createdAt || lp.createdAt,
          };
        }
      } else {
        merged.push(cp);
      }
    }
    useProjectStore.setState({ projects: merged, syncStatus: 'tersinkron', syncMessage: '' });
  }, (err: any) => {
    const code = err?.code || err?.message || '';
    let msg = 'Galat sinkron';
    if (code === 'permission-denied' || String(code).includes('permission-denied') || String(code).includes('PERMISSION_DENIED')) {
      msg = 'Akses ditolak. Periksa Rules Firestore di Firebase.';
    } else {
      msg = code ? String(code) : 'Galat tidak dikenal';
    }
    console.warn('[sync]', code);
    useProjectStore.getState().setSyncStatus('galat', msg);
  });
}

function handleLogin(uid: string) {
  startListener(uid);
  ambilSemuaProyek(uid).then((cloudProj) => {
    const state = useProjectStore.getState();
    const cloudIds = new Set(cloudProj.map((p) => p.id));
    const localOnly = state.projects.filter((p: any) => !cloudIds.has(p.id));
    if (localOnly.length > 0) {
      confirm('Unggah ' + localOnly.length + ' proyek lokal ke akunmu?', '', () => {
        localOnly.forEach((p: any) => {
          const isCurrent = p.id === state.currentProjectId;
          const obj = buildUploadObj(p, isCurrent);
          simpanProyek(uid, obj).catch((e) => console.warn('[sync]', e?.code || e?.message || e));
        });
        useProjectStore.getState().setSyncStatus('menyinkronkan');
      });
    }
  }).catch((e) => {
    console.warn('[sync]', e?.code || e?.message || e);
  });
}

function stopListener() {
  if (syncUnsub) { syncUnsub(); syncUnsub = null; }
}

// Reaksi login / logout dari authStore
useAuthStore.subscribe((state) => {
  const prev = useAuthStore.getState(); // not useful
});

// Gunakan unwrap satu kali saat modul dimuat untuk mendeteksi perubahan auth
let prevUid: string | null = null;

// Pemeriksaan awal saat modul dimuat
(() => {
  const auth = useAuthStore.getState();
  if (auth.user && !auth.isGuest) {
    const uid = auth.user.uid;
    prevUid = uid;
    handleLogin(uid);
  }
})();

useAuthStore.subscribe((state, prevState) => {
  const user = state.user;
  const wasGuest = prevState?.isGuest ?? true;
  const isGuest = state.isGuest;
  // Saat login (bukan tamu) dari null / tamu ke akun
  if (user && !isGuest && (!prevState?.user || (prevState.isGuest && !isGuest))) {
    const uid = user.uid;
    if (uid !== prevUid) {
      prevUid = uid;
      handleLogin(uid);
    }
  }
  // Keluar / ke tamu
  if ((!user || isGuest) && prevState?.user && !prevState.isGuest) {
    stopListener();
    prevUid = null;
    // Bersihkan proyek lokal dan draf denah
    const wallStore = useWallStore.getState();
    wallStore.reset();
    useProjectStore.getState().setSyncStatus('lokal', '');
    // Hapus semua proyek lokal agar tidak bocor
    useProjectStore.setState({ projects: [], currentProjectId: null });
  }
});
