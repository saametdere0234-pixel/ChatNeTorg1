import { useState } from "react";
import { useAuthContext } from "@/hooks/use-auth-context";
import { useGetFriends, useAddFriend, getGetFriendsQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface SidebarProps {
  currentTab: "general" | string;
  onSelectTab: (tabId: "general" | string, label?: string) => void;
}

export function Sidebar({ currentTab, onSelectTab }: SidebarProps) {
  const { user } = useAuthContext();
  const setToken = useAuthStore(state => state.setToken);
  const setSavedFriendToken = useAuthStore(state => state.setSavedFriendToken);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: friends = [] } = useGetFriends();
  const addFriendMutation = useAddFriend();

  const [addToken, setAddToken] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const handleCopyToken = () => {
    if (user?.friendToken) {
      navigator.clipboard.writeText(user.friendToken);
      toast({ title: "Copied", description: "Token copied to clipboard." });
    }
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addToken.trim()) return;
    addFriendMutation.mutate({ data: { token: addToken.trim() } }, {
      onSuccess: (newFriend) => {
        setAddOpen(false);
        setAddToken("");
        queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
        onSelectTab(newFriend.id, newFriend.label);
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed", description: "Invalid or unknown token." });
      },
    });
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

      {/* Identity */}
      <div className="px-3 py-2 border-b border-border text-muted-foreground">
        <div>id: <button onClick={handleCopyToken} className="text-foreground hover:text-primary">{user?.friendToken}</button></div>
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
      <div className="px-3 py-2 flex-1 overflow-y-auto">
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
              disabled={addFriendMutation.isPending || !addToken.trim()}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {addFriendMutation.isPending ? "adding..." : "[add]"}
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

      {/* Logout */}
      <div className="px-3 py-2 border-t border-border">
        <button
          onClick={handleLogout}
          className="text-muted-foreground hover:text-destructive text-xs"
        >
          [logout]
        </button>
      </div>
    </div>
  );
}
