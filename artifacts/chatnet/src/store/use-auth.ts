import { create } from 'zustand';

// Keys that are wiped on clearAllData / storage-off toggle
// NOTE: chatnet_friend_token is intentionally excluded — it is the user's
// permanent identity and must survive logout/clearAllData cycles so the
// login form can always pre-fill it.
export const GENERAL_MESSAGES_CACHE_KEY = 'chatnet_general_messages';
const STORAGE_KEYS = ['chatnet_token', GENERAL_MESSAGES_CACHE_KEY];
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
  // Always read from localStorage — friend token is always persisted
  savedFriendToken: localStorage.getItem('chatnet_friend_token'),
  storageEnabled: readStorageEnabled(),

  setToken: (token) => {
    const { storageEnabled } = get();
    if (storageEnabled && token) {
      localStorage.setItem('chatnet_token', token);
    } else {
      localStorage.removeItem('chatnet_token');
    }
    set({ token });
  },

  setSavedFriendToken: (ft) => {
    // Always persist — friend token is the user's login identity, not session data
    if (ft) {
      localStorage.setItem('chatnet_friend_token', ft);
    } else {
      localStorage.removeItem('chatnet_friend_token');
    }
    set({ savedFriendToken: ft });
  },

  setStorageEnabled: (enabled) => {
    localStorage.setItem(STORAGE_ENABLED_KEY, String(enabled));
    if (!enabled) {
      // Turning off — purge session data (token + cached messages, not friend token)
      for (const key of STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    } else {
      // Turning on — re-persist current token if any
      const { token } = get();
      if (token) localStorage.setItem('chatnet_token', token);
    }
    set({ storageEnabled: enabled });
  },

  clearAllData: () => {
    // Wipe session keys; friend token is intentionally preserved
    for (const key of STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    // Only reset token in memory; savedFriendToken stays so the login form can pre-fill
    set({ token: null });
  },
}));
