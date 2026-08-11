import { create } from 'zustand';

// Session keys cleared on logout or when starting a fresh login.
// NOTE: chatnet_friend_token is intentionally excluded — it is the user's
// permanent identity and must survive logout/clearAllData cycles so the
// login form can always pre-fill it.
export const GENERAL_MESSAGES_CACHE_KEY = 'chatnet_general_messages';
const STORAGE_KEYS = ['chatnet_token', GENERAL_MESSAGES_CACHE_KEY];
const LEGACY_STORAGE_ENABLED_KEY = 'chatnet_storage_enabled';

// Remove the retired storage preference from older sessions. History is now
// managed explicitly through the delete-history action.
try {
  localStorage.removeItem(LEGACY_STORAGE_ENABLED_KEY);
} catch {
  // Ignore unavailable browser storage.
}

interface AuthStore {
  token: string | null;
  savedFriendToken: string | null;
  setToken: (token: string | null) => void;
  setSavedFriendToken: (ft: string | null) => void;
  clearAllData: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  // Always read from localStorage — friend token is always persisted
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
    // Always persist — friend token is the user's login identity, not session data
    if (ft) {
      localStorage.setItem('chatnet_friend_token', ft);
    } else {
      localStorage.removeItem('chatnet_friend_token');
    }
    set({ savedFriendToken: ft });
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
