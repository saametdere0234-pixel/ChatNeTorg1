import { setAuthTokenGetter } from '@workspace/api-client-react';

export function setupAuthClient() {
  setAuthTokenGetter(() => {
    return localStorage.getItem('chatnet_token');
  });
}
