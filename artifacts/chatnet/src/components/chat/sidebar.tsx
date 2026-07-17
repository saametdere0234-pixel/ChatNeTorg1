import { useRef, useState } from "react";
import { useAuthContext } from "@/hooks/use-auth-context";
import {
  useGetFriends,
  useRemoveFriend,
  useUpdateMe,
  addFriend,
  getGetFriendsQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth";
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
  const setToken = useAuthStore(state => state.setToken);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: friends = [] } = useGetFriends();
  const removeFriendMutation = useRemoveFriend();
  const updateMeMutation = useUpdateMe();

  // Profile rename
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Add friend
  const [addOpen, setAddOpen] = useState(false);
  const [addToken, setAddToken] = useState("");

  // Logout confirm
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  // Quiet mode is on user object
  const quietMode = user?.quietMode ?? false;

  // Friend right-click context menu
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
    if (!trimmed || trimmed === user?.displayName) {
      setEditingName(false);
      return;
    }
    updateMeMutation.mutate(
      { data: { displayName: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setEditingName(false);
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
    updateMeMutation.mutate(
      { data: { quietMode: !quietMode } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
      }
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

  const handleFriendContextMenu = (e: React.MouseEvent, friendId: string, friendLabel: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, friendId, friendLabel });
  };

  const handleLogout = () => {
    setToken(null);
    setLocation("/auth");
  };

  return (
    <div className="w-52 flex flex-col h-full bg-card border-r border-border font-mono text-xs">
      {/* Logo */}
      <div className="px-3 py-2 border-b border-border">
        <span className="text-sm font-bold" style={{ color: 'var(--logo-chat)' }}>Chat</span>
        <span className="text-sm font-bold" style={{ color: 'var(--logo-net)' }}>Net</span>
      </div>

      {/* Identity / Profile */}
      <div className="px-3 py-2 border-b border-border">
        {/* Display name — click to rename */}
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
            className="w-full bg-background border border-primary px-1 py-0 text-xs font-mono text-foreground outline-none mb-0.5"
          />
        ) : (
          <button
            onClick={startRename}
            className="block text-foreground hover:text-primary font-bold text-xs mb-0.5 text-left"
            title="Click to change name"
          >
            {user?.displayName ?? "..."}
          </button>
        )}
        {/* ID — only for registered users */}
        {user && !user.isGuest && (
          <div className="text-muted-foreground">
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
      <div className="px-3 py-2 border-b border-border">
        <div className="text-muted-foreground mb-1">channels</div>
        <button
          onClick={() => onSelectTab("general")}
          className={`block w-full text-left px-1 py-0.5 ${
            currentTab === "general" ? "text-primary" : "text-foreground hover:text-primary"
          }`}
        >
          # general
        </button>
      </div>

      {/* Friends */}
      <div className="px-3 py-2 flex-1 overflow-y-auto border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground">friends</span>
          <button
            onClick={() => setAddOpen(v => !v)}
            className="text-muted-foreground hover:text-primary"
            title="Add friend by token"
          >
            [+]
          </button>
        </div>

        {addOpen && (
          <form onSubmit={handleAddFriend} className="mb-2">
            <input
              value={addToken}
              onChange={e => setAddToken(e.target.value)}
              placeholder="xx.xx.xx.xx"
              maxLength={11}
              className="w-full bg-background border border-border px-1 py-0.5 text-xs font-mono text-foreground outline-none mb-1 placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!addToken.trim()}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              [add]
            </button>
          </form>
        )}

        {friends.length === 0 ? (
          <div className="text-muted-foreground">none</div>
        ) : (
          friends.map((friend) => (
            <button
              key={friend.id}
              onClick={() => onSelectTab(friend.id, friend.label)}
              onContextMenu={(e) => handleFriendContextMenu(e, friend.id, friend.label)}
              className={`block w-full text-left px-1 py-0.5 ${
                currentTab === friend.id ? "text-primary" : "text-foreground hover:text-primary"
              }`}
            >
              {friend.label}
              {friend.unreadCount && friend.unreadCount > 0 ? (
                <span className="ml-1 text-primary">[{friend.unreadCount}]</span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {/* Quiet Mode */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={toggleQuietMode}
          className={`text-xs ${quietMode ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          disabled={updateMeMutation.isPending}
        >
          {quietMode ? "[quiet mode: on]" : "[quiet mode: off]"}
        </button>
      </div>

      {/* Logout */}
      <div className="px-3 py-2 border-t border-border flex items-center h-9">
        {logoutConfirm ? (
          <span className="text-xs text-foreground">
            sure?{" "}
            <button onClick={handleLogout} className="text-destructive hover:underline">yes</button>
            {" / "}
            <button onClick={() => setLogoutConfirm(false)} className="text-muted-foreground hover:text-foreground">no</button>
          </span>
        ) : (
          <button
            onClick={() => setLogoutConfirm(true)}
            className="text-muted-foreground hover:text-destructive text-xs"
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
