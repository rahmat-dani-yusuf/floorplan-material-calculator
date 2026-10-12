import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export interface AuthUser {
  uid: string;
  nama: string | null;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isGuest: boolean;
  ready: boolean;
  enterGuest: () => void;
  setUserFromFirebase: (fb: FirebaseUser | null) => void;
  setReady: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isGuest: false,
      ready: false,
      enterGuest: () => set({ user: null, isGuest: true, ready: true }),
      setUserFromFirebase: (fb) => {
        if (fb) {
          set({ user: { uid: fb.uid, nama: fb.displayName || null, email: fb.email || null }, isGuest: false, ready: true });
        } else {
          set({ user: null, isGuest: false, ready: true });
        }
      },
      setReady: (v) => set({ ready: v }),
      logout: () => {
        set({ user: null, isGuest: false, ready: true });
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
