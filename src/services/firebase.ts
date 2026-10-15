import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebasePersistence = {
  getItem: async (key: string) => AsyncStorage.getItem(key),
  setItem: async (key: string, value: string | null) => { if (value === null) await AsyncStorage.removeItem(key); else await AsyncStorage.setItem(key, value); },
  removeItem: async (key: string) => AsyncStorage.removeItem(key),
};

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];

export const auth = (() => {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }
  return initializeAuth(app, { persistence: firebasePersistence as any });
})();

export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
