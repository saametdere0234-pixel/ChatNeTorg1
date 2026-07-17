import { create } from 'zustand';

interface AuthStore {
  token: string | null;
  savedFriendToken: string | null;
  setToken: (token: string | null) => void;
  setSavedFriendToken: (ft: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  // No auto-login: always start logged out
  token: null,
  // But remember the 8-digit ID for convenience on the login form
  savedFriendToken: localStorage.getItem('chatnet_friend_token'),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('chatnet_token', token);
    } else {
      localStorage.removeItem('chatnet_token');
    }
    set({ token });
  },
  setSavedFriendToken: (ft) => {
    if (ft) {
      localStorage.setItem('chatnet_friend_token', ft);
    } else {
      localStorage.removeItem('chatnet_friend_token');
    }
    set({ savedFriendToken: ft });
  },
}));
