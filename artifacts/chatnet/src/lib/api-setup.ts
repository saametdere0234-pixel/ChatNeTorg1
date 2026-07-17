import { setAuthTokenGetter } from '@workspace/api-client-react';
import { useAuthStore } from '@/store/use-auth';

export function setupAuthClient() {
  setAuthTokenGetter(() => {
    // Always prefer the in-memory token from the store.
    // This works regardless of whether storage is on or off.
    // Falls back to localStorage for sessions where the token was
    // previously persisted and the store hasn't been hydrated yet.
    return useAuthStore.getState().token ?? localStorage.getItem('chatnet_token');
  });
}
