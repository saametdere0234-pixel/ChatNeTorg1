import { create } from 'zustand';

// All localStorage keys used by ChatNet
export const GENERAL_MESSAGES_CACHE_KEY = 'chatnet_general_messages';
const STORAGE_KEYS = ['chatnet_token', 'chatnet_friend_token', GENERAL_MESSAGES_CACHE_KEY];
const STORAGE_ENABLED_KEY = 'chatnet_storage_enabled';

interface AuthStore {
  token: string | null;
  savedFriendToken: string | null;
  storageEnabled: boolean;
  setToken: (token: string | null) => void;
  setSavedFriendToken: (ft: string | null) => void;
  setStorageEnabled: (enabled: boolean) => void;
  clearAllData: () => void;
}

function readStorageEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_ENABLED_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  savedFriendToken: localStorage.getItem('chatnet_friend_token'),
  storageEnabled: readStorageEnabled(),

  setToken: (token) => {
    const { storageEnabled } = get();
    if (storageEnabled) {
      if (token) {
        localStorage.setItem('chatnet_token', token);
      } else {
        localStorage.removeItem('chatnet_token');
      }
    } else {
      // Storage off — never persist token
      localStorage.removeItem('chatnet_token');
    }
    set({ token });
  },

  setSavedFriendToken: (ft) => {
    const { storageEnabled } = get();
    if (storageEnabled) {
      if (ft) {
        localStorage.setItem('chatnet_friend_token', ft);
      } else {
        localStorage.removeItem('chatnet_friend_token');
      }
    } else {
      localStorage.removeItem('chatnet_friend_token');
    }
    set({ savedFriendToken: ft });
  },

  setStorageEnabled: (enabled) => {
    // Always persist this preference itself
    localStorage.setItem(STORAGE_ENABLED_KEY, String(enabled));
    if (!enabled) {
      // Turning off — remove all session data from localStorage now
      for (const key of STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    } else {
      // Turning on — write current token if any
      const { token } = get();
      if (token) localStorage.setItem('chatnet_token', token);
    }
    set({ storageEnabled: enabled });
  },

  clearAllData: () => {
    for (const key of STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    set({ token: null, savedFriendToken: null });
  },
}));
