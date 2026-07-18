import { useEffect } from 'react';
import { useSocketStore } from '../store/use-socket';
import { DirectMessage, getGetFriendMessagesQueryKey, getGetFriendsQueryKey } from '@workspace/api-client-react';
import { useQueryClient as useReactQueryClient } from '@tanstack/react-query';

export function useSocketEvents() {
  // Subscribe only to socket — the only value that triggers the effect to re-register
  // listeners. Actions (append/remove/patch) are stable Zustand refs read via getState()
  // inside the effect so they never cause unnecessary re-renders.
  const socket = useSocketStore(s => s.socket);
  const queryClient = useReactQueryClient();

  useEffect(() => {
    if (!socket) return;

    // Stable action refs — these never change identity between renders
    const {
      appendGeneralMessage,
      removeGeneralMessage,
      removeGeneralMessages,
      patchGeneralMessage,
    } = useSocketStore.getState();

    // ── General chat ──────────────────────────────────────────────────────
    const onNewGeneralMessage = (message: Parameters<typeof appendGeneralMessage>[0]) => {
      appendGeneralMessage(message);
    };

    const onGeneralMessageDeleted = ({ messageId }: { messageId: string }) => {
      removeGeneralMessage(messageId);
    };

    const onGeneralMessagesDeleted = ({ messageIds }: { messageIds: string[] }) => {
      removeGeneralMessages(messageIds);
    };

    const onGeneralSeen = ({ messageId }: { messageId: string; userId: string }) => {
      patchGeneralMessage(messageId, { seenByMe: true });
    };

    // ── DM chat (still uses React Query) ─────────────────────────────────
    const onNewDm = ({ message, fromFriendId }: { message: DirectMessage; fromFriendId: string }) => {
      queryClient.setQueryData<DirectMessage[]>(getGetFriendMessagesQueryKey(fromFriendId), (old = []) => {
        if (old.some(m => m.id === message.id)) return old;
        return [...old, message];
      });
    };

    const onDmNotification = () => {
      queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
    };

    const onMessagesSeen = ({ byUserId, seenAt, messageIds }: { byUserId: string; seenAt: string; messageIds: string[] }) => {
      queryClient.setQueryData<DirectMessage[]>(getGetFriendMessagesQueryKey(byUserId), (old = []) =>
        old.map(msg => messageIds.includes(msg.id) ? { ...msg, seenAt } : msg)
      );
    };

    socket.on('new-general-message',      onNewGeneralMessage);
    socket.on('general-message-deleted',  onGeneralMessageDeleted);
    socket.on('general-messages-deleted', onGeneralMessagesDeleted);
    socket.on('general-seen',             onGeneralSeen);
    socket.on('new-dm',                   onNewDm);
    socket.on('dm-notification',          onDmNotification);
    socket.on('messages-seen',            onMessagesSeen);

    return () => {
      socket.off('new-general-message',      onNewGeneralMessage);
      socket.off('general-message-deleted',  onGeneralMessageDeleted);
      socket.off('general-messages-deleted', onGeneralMessagesDeleted);
      socket.off('general-seen',             onGeneralSeen);
      socket.off('new-dm',                   onNewDm);
      socket.off('dm-notification',          onDmNotification);
      socket.off('messages-seen',            onMessagesSeen);
    };
  }, [socket, queryClient]);
}
