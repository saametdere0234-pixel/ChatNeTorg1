import { useRef, useState } from "react";
import { useAuthContext } from "@/hooks/use-auth-context";
import {
  useGetFriends,
  useRemoveFriend,
  useUpdateMe,
  useDeleteMyGeneralHistory,
  useDeleteMyDmHistory,
  useDeleteFriendHistory,
  addFriend,
  getGetFriendsQueryKey,
  getGetMeQueryKey,
  getGetGeneralMessagesQueryKey,
  getGetFriendMessagesQueryKey,
} from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth";
import { useSocketStore } from "@/store/use-socket";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ContextMenuOverlay } from "@/components/ui/context-menu-overlay";

interface SidebarProps {
  currentTab: "general" | string;
  onSelectTab: (tabId: "general" | string, label?: string) => void;
}

interface CtxMenu {
  x: number;
  y: number;
  friendId: string;
  friendLabel: string;
}

export function Sidebar({ currentTab, onSelectTab }: SidebarProps) {
  const { user } = useAuthContext();
  const setToken          = useAuthStore(state => state.setToken);
  const emitNameUpdate    = useSocketStore(state => state.emitNameUpdate);
  const userLabels        = useSocketStore(state => state.userLabels);
  const initGeneralMessages = useSocketStore(state => state.initGeneralMessages);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: friends = [] } = useGetFriends();
  const removeFriendMutation = useRemoveFriend();
  const updateMeMutation     = useUpdateMe();
  const deleteGeneralHistoryMutation = useDeleteMyGeneralHistory();
  const deleteDmHistoryMutation = useDeleteMyDmHistory();
  const deleteFriendHistoryMutation = useDeleteFriendHistory();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addToken, setAddToken] = useState("");

  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteHistoryConfirm, setDeleteHistoryConfirm] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);

  const quietMode = user?.quietMode ?? false;
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  const handleCopyToken = () => {
    if (user?.friendToken) {
      navigator.clipboard.writeText(user.friendToken);
      toast({ title: "Copied", description: "Your ID copied to clipboard." });
    }
  };

  const startRename = () => {
    setNameInput(user?.displayName ?? "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const commitRename = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user?.displayName) { setEditingName(false); return; }
    updateMeMutation.mutate(
      { data: { displayName: trimmed } },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setEditingName(false);
          emitNameUpdate(updated.displayName ?? trimmed);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast({ variant: "destructive", title: "Error", description: msg ?? "Could not update name." });
          setEditingName(false);
        },
      }
    );
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addToken.trim()) return;
    addFriend({ token: addToken.trim() })
      .then((newFriend) => {
        setAddOpen(false);
        setAddToken("");
        queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
        onSelectTab(newFriend.id, newFriend.label);
      })
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ variant: "destructive", title: "Failed", description: msg ?? "Invalid token or quiet mode enabled." });
      });
  };

  const toggleQuietMode = () => {
    const next = !quietMode;
    queryClient.setQueryData(getGetMeQueryKey(), (old: typeof user) =>
      old ? { ...old, quietMode: next } : old
    );
    updateMeMutation.mutate(
      { data: { quietMode: next } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        onError: () => {
          queryClient.setQueryData(getGetMeQueryKey(), (old: typeof user) =>
            old ? { ...old, quietMode: !next } : old
          );
        },
      }
    );
  };

  const handleDeleteAllHistory = async () => {
    setDeletingHistory(true);
    try {
      await Promise.all([
        deleteGeneralHistoryMutation.mutateAsync(),
        deleteDmHistoryMutation.mutateAsync(),
      ]);

      initGeneralMessages([]);
      localStorage.removeItem("chatnet_general_messages");
      queryClient.setQueryData(getGetGeneralMessagesQueryKey(), []);
      queryClient.setQueriesData<unknown[]>({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string"
            && key.startsWith("/api/friends/")
            && key.endsWith("/messages");
        },
      }, () => []);
      queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
      setDeleteHistoryConfirm(false);
      toast({ title: "History deleted", description: "Your chat and DM history was deleted." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete all history." });
    } finally {
      setDeletingHistory(false);
    }
  };

  const handleDeleteFriendHistory = (friendId: string, friendLabel: string) => {
    if (!window.confirm(`are you sure you want to delete your history with ${friendLabel}?`)) return;

    deleteFriendHistoryMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          queryClient.setQueryData(getGetFriendMessagesQueryKey(friendId), []);
          queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
          toast({ title: "History deleted", description: `DM history with ${friendLabel} was deleted.` });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not delete DM history." });
        },
      },
    );
  };

  const handleRemoveFriend = (friendId: string, friendLabel: string) => {
    removeFriendMutation.mutate(
      { friendId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
          if (currentTab === friendId) onSelectTab("general");
          toast({ title: "Removed", description: `${friendLabel} removed from friends.` });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not remove friend." });
        },
      }
    );
  };

  const openFriendMenu = (x: number, y: number, friendId: string, friendLabel: string) => {
    setCtxMenu({ x, y, friendId, friendLabel });
  };

  const handleLogout = () => {
    // Clear in-memory messages immediately before navigating away
    initGeneralMessages([]);
    localStorage.removeItem('chatnet_general_messages');
    // Null token removes it from localStorage via setToken logic
    setToken(null);
    queryClient.clear();
    setLocation("/auth");
  };

  return (
    // w-64 on mobile gives more comfortable tap targets; w-52 on desktop keeps it compact
    <div className="w-64 sm:w-52 flex flex-col h-full bg-card border-r border-border font-mono text-sm sm:text-xs">

      {/* Logo */}
      <div className="px-3 py-3 sm:py-2 border-b border-border shrink-0">
        <span className="text-base sm:text-sm font-bold" style={{ color: 'var(--logo-chat)' }}>Chat</span>
        <span className="text-base sm:text-sm font-bold" style={{ color: 'var(--logo-net)' }}>Net</span>
      </div>

      {/* Identity / Profile */}
      <div className="px-3 py-3 sm:py-2 border-b border-border shrink-0">
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingName(false);
            }}
            maxLength={30}
            className="w-full bg-background border border-primary px-1 py-0.5 text-sm sm:text-xs font-mono text-foreground outline-none mb-0.5"
          />
        ) : (
          <button
            onClick={startRename}
            className="block text-foreground hover:text-primary font-bold text-sm sm:text-xs mb-0.5 text-left w-full truncate"
            title="Click to change name"
          >
            {user?.displayName ?? "..."}
          </button>
        )}
        {user && !user.isGuest && (
          <div className="text-muted-foreground truncate">
            id:{" "}
            <button onClick={handleCopyToken} className="text-foreground hover:text-primary">
              {user.friendToken}
            </button>
          </div>
        )}
        {user?.isGuest && (
          <div className="text-muted-foreground italic">guest session</div>
        )}
      </div>

      {/* Channels */}
      <div className="px-3 py-3 sm:py-2 border-b border-border shrink-0">
        <div className="text-muted-foreground mb-1">channels</div>
        <button
          onClick={() => onSelectTab("general")}
          className={`block w-full text-left px-1 py-2 sm:py-0.5 ${
            currentTab === "general" ? "text-primary" : "text-foreground hover:text-primary"
          }`}
        >
          # general
        </button>
      </div>

      {/* Friends */}
      <div className="px-3 py-3 sm:py-2 flex-1 overflow-y-auto border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground">friends</span>
          {!user?.isGuest && (
            <button
              onClick={() => setAddOpen(v => !v)}
              className="text-muted-foreground hover:text-primary text-base sm:text-sm px-1"
              title="Add friend by token"
            >
              [+]
            </button>
          )}
        </div>

        {!user?.isGuest && addOpen && (
          <form onSubmit={handleAddFriend} className="mb-2">
            <input
              value={addToken}
              onChange={e => setAddToken(e.target.value)}
              placeholder="xx.xx.xx.xx"
              maxLength={11}
              className="w-full bg-background border border-border px-2 py-1 text-sm sm:text-xs font-mono text-foreground outline-none mb-1 placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!addToken.trim()}
              className="text-sm sm:text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              [add]
            </button>
          </form>
        )}

        {friends.length === 0 ? (
          <div className="text-muted-foreground">none</div>
        ) : (
          friends.map((friend) => {
            const liveLabel = userLabels[friend.id] ?? friend.label;
            return (
              <div key={friend.id} className="flex items-center">
                <button
                  onClick={() => onSelectTab(friend.id, liveLabel)}
                  onContextMenu={(e) => { e.preventDefault(); openFriendMenu(e.clientX, e.clientY, friend.id, liveLabel); }}
                  className={`flex-1 min-w-0 text-left px-1 py-2 sm:py-0.5 truncate ${
                    currentTab === friend.id ? "text-primary" : "text-foreground hover:text-primary"
                  }`}
                >
                  {liveLabel}
                  {friend.unreadCount && friend.unreadCount > 0 ? (
                    <span className="ml-1 text-primary">[{friend.unreadCount}]</span>
                  ) : null}
                </button>
                {/* Mobile-only ⋮ tap button */}
                <button
                  onClick={(e) => openFriendMenu(e.clientX, e.clientY, friend.id, liveLabel)}
                  className="sm:hidden shrink-0 px-3 py-2 text-muted-foreground hover:text-foreground text-lg leading-none"
                  aria-label="Friend options"
                >
                  ⋮
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Delete stored history — hidden for guests */}
      {!user?.isGuest && (
        <div className="px-3 py-3 sm:py-2 border-b border-border shrink-0">
          {deleteHistoryConfirm ? (
            <span className="text-foreground">
              are you sure?{" "}
              <button
                onClick={handleDeleteAllHistory}
                disabled={deletingHistory}
                className="text-destructive hover:underline disabled:opacity-40"
              >
                {deletingHistory ? "deleting..." : "yes"}
              </button>
              {" / "}
              <button
                onClick={() => setDeleteHistoryConfirm(false)}
                disabled={deletingHistory}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                no
              </button>
            </span>
          ) : (
            <button
              onClick={() => setDeleteHistoryConfirm(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              [delete storage]
            </button>
          )}
        </div>
      )}

      {/* Quiet Mode — registered users only */}
      {!user?.isGuest && (
        <div className="px-3 py-3 sm:py-2 border-b border-border shrink-0">
          <button
            onClick={toggleQuietMode}
            className={`${quietMode ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            disabled={updateMeMutation.isPending}
          >
            {quietMode ? "[quiet mode: on]" : "[quiet mode: off]"}
          </button>
        </div>
      )}

      {/* Logout */}
      <div className="px-3 border-t border-border flex items-center h-11 sm:h-9 shrink-0">
        {logoutConfirm ? (
          <span className="text-foreground">
            sure?{" "}
            <button onClick={handleLogout} className="text-destructive hover:underline">yes</button>
            {" / "}
            <button onClick={() => setLogoutConfirm(false)} className="text-muted-foreground hover:text-foreground">no</button>
          </span>
        ) : (
          <button
            onClick={() => setLogoutConfirm(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            [logout]
          </button>
        )}
      </div>

      {/* Friend context menu */}
      {ctxMenu && (
        <ContextMenuOverlay
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: "Delete history",
              danger: true,
              onClick: () => handleDeleteFriendHistory(ctxMenu.friendId, ctxMenu.friendLabel),
            },
            {
              label: `Remove ${ctxMenu.friendLabel}`,
              danger: true,
              onClick: () => handleRemoveFriend(ctxMenu.friendId, ctxMenu.friendLabel),
            },
          ]}
        />
      )}
    </div>
  );
}
