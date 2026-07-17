import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { GeneralMessage, DirectMessage } from '@workspace/api-client-react';

interface TypingState {
  [roomId: string]: { [userId: string]: string }; // roomId -> userId -> anonLabel
}

interface SocketStore {
  socket: Socket | null;
  isConnected: boolean;
  inGeneral: boolean; // tracks whether we are currently in the general room
  typingState: TypingState;
  userLabels: Record<string, string>; // userId -> latest known display label
  generalUserCount: number;
  connect: (token: string) => void;
  disconnect: () => void;
  joinGeneral: () => void;
  leaveGeneral: () => void;
  sendGeneralMessage: (content: string) => void;
  deleteGeneralMessage: (messageId: string) => void;
  deleteGeneralMessages: (messageIds: string[]) => void;
  joinDm: (friendId: string) => void;
  leaveDm: (friendId: string) => void;
  sendDmMessage: (friendId: string, content: string) => void;
  emitTyping: (room: 'general' | string) => void;
  emitStopTyping: (room: 'general' | string) => void;
  emitDmSeen: (friendId: string) => void;
  emitNameUpdate: (displayName: string) => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  isConnected: false,
  inGeneral: false,
  typingState: {},
  userLabels: {},
  generalUserCount: 0,

  connect: (token: string) => {
    if (get().socket) return; // already connected — do not create a duplicate

    const socket = io({
      path: '/api/socket.io',
      auth: { token },
      // Reconnect quickly and reliably
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
    });

    socket.on('connect', () => {
      set({ isConnected: true });
      // Re-join the general room after every (re)connect — socket.io drops room
      // memberships on the server side whenever a connection is lost and re-established.
      if (get().inGeneral) {
        socket.emit('join-general');
      }
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('typing', ({ userId, anonLabel, room }: { userId: string; anonLabel: string; room: string }) => {
      set((state) => ({
        typingState: {
          ...state.typingState,
          [room]: { ...(state.typingState[room] || {}), [userId]: anonLabel },
        },
      }));
    });

    socket.on('stop-typing', ({ userId, room }: { userId: string; room: string }) => {
      set((state) => {
        const roomState = { ...state.typingState[room] };
        delete roomState[userId];
        return { typingState: { ...state.typingState, [room]: roomState } };
      });
    });

    socket.on('display-name-changed', ({ userId, newLabel }: { userId: string; newLabel: string }) => {
      set((state) => ({ userLabels: { ...state.userLabels, [userId]: newLabel } }));
    });

    socket.on('general-user-count', (count: number) => {
      set({ generalUserCount: count });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, inGeneral: false, typingState: {}, userLabels: {}, generalUserCount: 0 });
    }
  },

  joinGeneral: () => {
    set({ inGeneral: true });
    get().socket?.emit('join-general');
  },

  leaveGeneral: () => {
    set({ inGeneral: false });
    get().socket?.emit('leave-general');
  },

  sendGeneralMessage: (content: string) => get().socket?.emit('general-message', { content }),
  deleteGeneralMessage: (messageId: string) => get().socket?.emit('delete-general-message', { messageId }),
  deleteGeneralMessages: (messageIds: string[]) => get().socket?.emit('delete-general-messages', { messageIds }),
  joinDm: (friendId: string) => get().socket?.emit('join-dm', { friendId }),
  leaveDm: (friendId: string) => get().socket?.emit('leave-dm', { friendId }),
  sendDmMessage: (friendId: string, content: string) => get().socket?.emit('dm-message', { friendId, content }),
  emitTyping: (room: 'general' | string) => get().socket?.emit('typing', { room }),
  emitStopTyping: (room: 'general' | string) => get().socket?.emit('stop-typing', { room }),
  emitDmSeen: (friendId: string) => get().socket?.emit('dm-seen', { friendId }),
  emitNameUpdate: (displayName: string) => get().socket?.emit('update-display-name', { displayName }),
}));
