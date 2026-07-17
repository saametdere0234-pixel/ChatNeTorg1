import { useEffect } from 'react';
import { useAuthStore } from '@/store/use-auth';
import { useSocketStore } from '@/store/use-socket';
import { useSocketEvents } from '@/hooks/use-socket-events';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';

export function useAuthContext() {
  const token = useAuthStore(state => state.token);
  const setToken = useAuthStore(state => state.setToken);
  const connect = useSocketStore(state => state.connect);
  const disconnect = useSocketStore(state => state.disconnect);
  const isConnected = useSocketStore(state => state.isConnected);

  const { data: user, error, isError, isLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  useEffect(() => {
    if (isError) {
      setToken(null);
      disconnect();
    }
  }, [isError, setToken, disconnect]);

  useEffect(() => {
    if (token && user) {
      connect(token);
    } else {
      disconnect();
    }
  }, [token, user, connect, disconnect]);

  useSocketEvents();

  return {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    isSocketConnected: isConnected,
  };
}
