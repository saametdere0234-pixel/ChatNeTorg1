import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { GeneralMessage, DirectMessage } from '@workspace/api-client-react';

interface TypingState {
  [roomId: string]: { [userId: string]: string }; // roomId -> userId -> anonLabel
}

interface SocketStore {
  socket: Socket | null;
  isConnected: boolean;
  inGeneral: boolean;
  typingState: TypingState;
  userLabels: Record<string, string>;
  generalUserCount: number;

  // ── General messages (source of truth for the general chat) ──────────────
  generalMessages: GeneralMessage[];
  // Whether the authoritative API history has already been used to seed the
  // store this session. Prevents navigating away and back from causing the
  // API to overwrite deletions or newly-arrived socket messages.
  generalMessagesInitialized: boolean;

  // Seed from localStorage only — does NOT set the initialized flag.
  // Used on mount for an instant display before the API fetch returns.
  seedGeneralMessages: (msgs: GeneralMessage[]) => void;
  // Authoritative seed from the API — sets generalMessagesInitialized so the
  // API never overwrites the store again within this session.
  initGeneralMessages: (msgs: GeneralMessage[]) => void;
  appendGeneralMessage: (msg: GeneralMessage) => void;
  removeGeneralMessage: (id: string) => void;
  removeGeneralMessages: (ids: string[]) => void;
  patchGeneralMessage: (id: string, patch: Partial<GeneralMessage>) => void;

  // ── Actions ───────────────────────────────────────────────────────────────
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

  generalMessages: [],
  generalMessagesInitialized: false,

  seedGeneralMessages: (msgs) => set({ generalMessages: msgs }),
  // generalMessagesInitialized is intentionally NOT reset here — once the API
  // has seeded the store for this session, it stays sealed until disconnect().
  initGeneralMessages: (msgs) =>
    set({ generalMessages: msgs, generalMessagesInitialized: true }),

  appendGeneralMessage: (msg) =>
    set((s) => {
      if (s.generalMessages.some((m) => m.id === msg.id)) return s;
      return { generalMessages: [...s.generalMessages, msg] };
    }),

  removeGeneralMessage: (id) =>
    set((s) => ({ generalMessages: s.generalMessages.filter((m) => m.id !== id) })),

  removeGeneralMessages: (ids) => {
    const deleted = new Set(ids);
    set((s) => ({ generalMessages: s.generalMessages.filter((m) => !deleted.has(m.id)) }));
  },

  patchGeneralMessage: (id, patch) =>
    set((s) => ({
      generalMessages: s.generalMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  connect: (token: string) => {
    if (get().socket) return;

    const socket = io(import.meta.env.VITE_API_URL || undefined, {
      path: '/api/socket.io',
      auth: { token },
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
    });

    socket.on('connect', () => {
      set({ isConnected: true });
      if (get().inGeneral) socket.emit('join-general');
    });

    socket.on('disconnect', () => set({ isConnected: false }));

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

    socket.on('general-user-count', (count: number) => set({ generalUserCount: count }));

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        inGeneral: false,
        typingState: {},
        userLabels: {},
        generalUserCount: 0,
        generalMessages: [],
        // Reset so the next session's API fetch can seed the store cleanly
        generalMessagesInitialized: false,
      });
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

  sendGeneralMessage: (content) => get().socket?.emit('general-message', { content }),
  deleteGeneralMessage: (messageId) => get().socket?.emit('delete-general-message', { messageId }),
  deleteGeneralMessages: (messageIds) => get().socket?.emit('delete-general-messages', { messageIds }),
  joinDm: (friendId) => get().socket?.emit('join-dm', { friendId }),
  leaveDm: (friendId) => get().socket?.emit('leave-dm', { friendId }),
  sendDmMessage: (friendId, content) => get().socket?.emit('dm-message', { friendId, content }),
  emitTyping: (room) => get().socket?.emit('typing', { room }),
  emitStopTyping: (room) => get().socket?.emit('stop-typing', { room }),
  emitDmSeen: (friendId) => get().socket?.emit('dm-seen', { friendId }),
  emitNameUpdate: (displayName) => get().socket?.emit('update-display-name', { displayName }),
}));
