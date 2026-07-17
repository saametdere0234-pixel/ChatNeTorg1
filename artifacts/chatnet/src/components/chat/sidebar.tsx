import { useState } from "react";
import { useAuthContext } from "@/hooks/use-auth-context";
import { useGetFriends, useAddFriend, getGetFriendsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogOut, Copy, Plus, Terminal, Hash, MessageSquareText } from "lucide-react";
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
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: friends = [] } = useGetFriends();
  const addFriendMutation = useAddFriend();

  const [addToken, setAddToken] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const handleCopyToken = () => {
    if (user?.friendToken) {
      navigator.clipboard.writeText(user.friendToken);
      toast({
        title: "TOKEN_COPIED",
        description: "Your connection token is in the clipboard.",
      });
    }
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addToken.trim()) return;

    addFriendMutation.mutate({ data: { token: addToken.trim() } }, {
      onSuccess: (newFriend) => {
        toast({
          title: "CONNECTION_ESTABLISHED",
          description: `Connected to ${newFriend.label}`,
        });
        setAddDialogOpen(false);
        setAddToken("");
        queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
        onSelectTab(newFriend.id, newFriend.label);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "CONNECTION_FAILED",
          description: "Invalid or unknown token.",
        });
      }
    });
  };

  const handleLogout = () => {
    setToken(null);
    setLocation("/auth");
  };

  return (
    <div className="w-80 flex flex-col h-full bg-card border-r border-border">
      {/* Header Profile */}
      <div className="p-6 border-b border-border bg-black/40">
        <div className="flex items-center gap-3 mb-4 text-primary">
          <Terminal className="w-5 h-5" />
          <h1 className="text-xl font-bold tracking-tighter">ChatNet</h1>
        </div>
        
        <div className="bg-background border border-border p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-mono text-muted-foreground uppercase">Identity</span>
            <span className="text-xs font-mono font-bold text-white">{user?.username}</span>
          </div>
          
          <div className="flex justify-between items-center group">
            <span className="text-xs font-mono text-muted-foreground uppercase">Token</span>
            <button 
              onClick={handleCopyToken}
              className="flex items-center gap-1 text-xs font-mono text-primary hover:text-white transition-colors"
            >
              {user?.friendToken}
              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Channels */}
          <div>
            <h3 className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Channels</h3>
            <button
              onClick={() => onSelectTab("general")}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors rounded-none border border-transparent ${
                currentTab === "general" 
                  ? "bg-primary/10 text-primary border-primary/30" 
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
            >
              <Hash className="w-4 h-4" />
              General
            </button>
          </div>

          {/* Direct Connections */}
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest">Connections</h3>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-primary hover:text-primary-foreground hover:bg-primary rounded-none p-1 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border rounded-none sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-mono text-primary uppercase tracking-widest flex items-center gap-2">
                      <Terminal className="w-5 h-5" />
                      Add_Connection
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddFriend} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                        Enter Target Token
                      </label>
                      <Input
                        value={addToken}
                        onChange={(e) => setAddToken(e.target.value)}
                        placeholder="xx.xx.xx.xx"
                        className="font-mono bg-background border-border focus-visible:ring-primary rounded-none h-12 text-center text-lg tracking-widest"
                        maxLength={11}
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full font-mono rounded-none tracking-widest"
                      disabled={addFriendMutation.isPending || !addToken.trim()}
                    >
                      {addFriendMutation.isPending ? "ESTABLISHING..." : "CONNECT"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-1">
              {friends.length === 0 ? (
                <div className="px-3 py-4 text-xs font-mono text-muted-foreground/50 border border-dashed border-border/50 text-center">
                  NO_CONNECTIONS_FOUND
                </div>
              ) : (
                friends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => onSelectTab(friend.id, friend.label)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-mono transition-colors rounded-none border border-transparent group ${
                      currentTab === friend.id
                        ? "bg-primary/10 text-white border-primary/30"
                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquareText className={`w-4 h-4 ${currentTab === friend.id ? "text-primary" : ""}`} />
                      {friend.label}
                    </div>
                    {friend.unreadCount && friend.unreadCount > 0 ? (
                      <span className="bg-primary text-primary-foreground text-[10px] px-1.5 min-w-[20px] text-center font-bold">
                        {friend.unreadCount}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border mt-auto">
        <Button 
          variant="outline" 
          onClick={handleLogout}
          className="w-full rounded-none font-mono text-xs text-muted-foreground border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 justify-start"
        >
          <LogOut className="w-4 h-4 mr-2" />
          TERMINATE_SESSION
        </Button>
      </div>
    </div>
  );
}
