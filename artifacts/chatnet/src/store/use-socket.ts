import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { GeneralMessage, DirectMessage } from '@workspace/api-client-react';

interface TypingState {
  [roomId: string]: { [userId: string]: string }; // roomId -> userId -> anonLabel
}

interface SocketStore {
  socket: Socket | null;
  isConnected: boolean;
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
  typingState: {},
  userLabels: {},
  generalUserCount: 0,

  connect: (token: string) => {
    const currentSocket = get().socket;
    if (currentSocket) return;

    const socket = io({
      path: '/api/socket.io',
      auth: { token },
    });

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('typing', ({ userId, anonLabel, room }: { userId: string, anonLabel: string, room: string }) => {
      set((state) => ({
        typingState: {
          ...state.typingState,
          [room]: {
            ...(state.typingState[room] || {}),
            [userId]: anonLabel,
          },
        },
      }));
    });

    socket.on('stop-typing', ({ userId, room }: { userId: string, room: string }) => {
      set((state) => {
        const roomState = { ...state.typingState[room] };
        delete roomState[userId];
        return {
          typingState: {
            ...state.typingState,
            [room]: roomState,
          },
        };
      });
    });

    // Track live display name changes from other users
    socket.on('display-name-changed', ({ userId, newLabel }: { userId: string; newLabel: string }) => {
      set((state) => ({
        userLabels: { ...state.userLabels, [userId]: newLabel },
      }));
    });

    // Live active user count in general channel
    socket.on('general-user-count', (count: number) => {
      set({ generalUserCount: count });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, typingState: {}, userLabels: {} });
    }
  },

  joinGeneral: () => get().socket?.emit('join-general'),
  leaveGeneral: () => get().socket?.emit('leave-general'),
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
