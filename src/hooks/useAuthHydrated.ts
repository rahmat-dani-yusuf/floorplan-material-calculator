import { useAuthStore } from '../store/authStore';
export const useAuthHydrated = () => useAuthStore((s) => s.ready);
