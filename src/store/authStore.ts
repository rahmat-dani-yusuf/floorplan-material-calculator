import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { checkIsAdmin } from '../services/priceCloud';

export interface AuthUser {
  uid: string;
  nama: string | null;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isGuest: boolean;
  ready: boolean;
  isAdmin: boolean;
  enterGuest: () => void;
  setUserFromFirebase: (fb: FirebaseUser | null) => void;
  setReady: (v: boolean) => void;
  setIsAdmin: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isGuest: false,
      ready: false,
      isAdmin: false,
      enterGuest: () => set({ user: null, isGuest: true, ready: true, isAdmin: false }),
      setUserFromFirebase: (fb) => {
        if (fb) {
          set({ user: { uid: fb.uid, nama: fb.displayName || null, email: fb.email || null }, isGuest: false, ready: true });
          checkIsAdmin(fb.uid)
            .then((admin) => set({ isAdmin: admin }))
            .catch(() => set({ isAdmin: false }));
        } else {
          set({ user: null, isGuest: false, ready: true, isAdmin: false });
        }
      },
      setReady: (v) => set({ ready: v }),
      setIsAdmin: (v) => set({ isAdmin: v }),
      logout: () => {
        set({ user: null, isGuest: false, ready: true, isAdmin: false });
      },
    }),
    {
      name: 'auth-v2',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ user: s.user, isGuest: s.isGuest, ready: s.ready }),
    },
  ),
);

// Setup listener once
let unsub: (() => void) | null = null;
export function initAuthListener() {
  if (unsub) return;
  unsub = onAuthStateChanged(auth, (fbUser) => {
    useAuthStore.getState().setUserFromFirebase(fbUser);
  });
}
export function stopAuthListener() {
  if (unsub) { unsub(); unsub = null; }
}
