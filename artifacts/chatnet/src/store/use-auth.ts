import { create } from 'zustand';

interface AuthStore {
  token: string | null;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: localStorage.getItem('chatnet_token'),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('chatnet_token', token);
    } else {
      localStorage.removeItem('chatnet_token');
    }
    set({ token });
  },
}));
