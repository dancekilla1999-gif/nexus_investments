import { create } from 'zustand';
import { PublicUser } from './types';

interface AuthState {
  accessToken: string | null;
  user: PublicUser | null;
  hydrated: boolean;
  setSession: (accessToken: string, user: PublicUser) => void;
  setHydrated: (hydrated: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  hydrated: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setHydrated: (hydrated) => set({ hydrated }),
  clear: () => set({ accessToken: null, user: null }),
}));
