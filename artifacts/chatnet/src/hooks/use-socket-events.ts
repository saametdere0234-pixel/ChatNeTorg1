import { useEffect } from 'react';
import { useSocketStore } from '../store/use-socket';
import { GeneralMessage, DirectMessage, getGetGeneralMessagesQueryKey, getGetFriendMessagesQueryKey, getGetFriendsQueryKey } from '@workspace/api-client-react';
import { useQueryClient as useReactQueryClient } from '@tanstack/react-query';

export function useSocketEvents() {
  const socket = useSocketStore(state => state.socket);
  const queryClient = useReactQueryClient();

  useEffect(() => {
    if (!socket) return;

    const onNewGeneralMessage = (message: GeneralMessage) => {
      queryClient.setQueryData<GeneralMessage[]>(getGetGeneralMessagesQueryKey(), (old = []) => {
        // Prevent duplicates
        if (old.some(m => m.id === message.id)) return old;
        return [...old, message];
      });
    };

    const onNewDm = ({ message, fromFriendId }: { message: DirectMessage, fromFriendId: string }) => {
      queryClient.setQueryData<DirectMessage[]>(getGetFriendMessagesQueryKey(fromFriendId), (old = []) => {
        if (old.some(m => m.id === message.id)) return old;
        return [...old, message];
      });
    };

    const onDmNotification = ({ fromFriendId }: { fromFriendId: string }) => {
      // Invalidate or update unread count for friends
      queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
    };

    const onMessagesSeen = ({ byUserId, seenAt, messageIds }: { byUserId: string, seenAt: string, messageIds: string[] }) => {
      queryClient.setQueryData<DirectMessage[]>(getGetFriendMessagesQueryKey(byUserId), (old = []) => {
        return old.map(msg => {
          if (messageIds.includes(msg.id)) {
            return { ...msg, seenAt };
          }
          return msg;
        });
      });
    };

    const onGeneralSeen = ({ messageId, userId }: { messageId: string, userId: string }) => {
      queryClient.setQueryData<GeneralMessage[]>(getGetGeneralMessagesQueryKey(), (old = []) => {
        return old.map(msg => {
          if (msg.id === messageId) {
            return { ...msg, seenByMe: true };
          }
          return msg;
        });
      });
    };

    socket.on('new-general-message', onNewGeneralMessage);
    socket.on('new-dm', onNewDm);
    socket.on('dm-notification', onDmNotification);
    socket.on('messages-seen', onMessagesSeen);
    socket.on('general-seen', onGeneralSeen);

    return () => {
      socket.off('new-general-message', onNewGeneralMessage);
      socket.off('new-dm', onNewDm);
      socket.off('dm-notification', onDmNotification);
      socket.off('messages-seen', onMessagesSeen);
      socket.off('general-seen', onGeneralSeen);
    };
  }, [socket, queryClient]);
}
