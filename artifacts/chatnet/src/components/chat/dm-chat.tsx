import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useGetFriendMessages, useMarkSeen, getGetFriendMessagesQueryKey, getGetFriendsQueryKey } from "@workspace/api-client-react";
import { useSocketStore } from "@/store/use-socket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, CheckCheck, Send } from "lucide-react";
import { useAuthContext } from "@/hooks/use-auth-context";
import { useQueryClient } from "@tanstack/react-query";

interface DmChatProps {
  friendId: string;
  friendLabel: string;
}

export function DmChat({ friendId, friendLabel }: DmChatProps) {
  const { data: messages = [], isLoading } = useGetFriendMessages(friendId, {
    query: {
      enabled: !!friendId,
      queryKey: getGetFriendMessagesQueryKey(friendId)
    }
  });
  const markSeenMutation = useMarkSeen();
  const queryClient = useQueryClient();
  
  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthContext();
  const joinDm = useSocketStore(state => state.joinDm);
  const leaveDm = useSocketStore(state => state.leaveDm);
  const sendDmMessage = useSocketStore(state => state.sendDmMessage);
  const emitTyping = useSocketStore(state => state.emitTyping);
  const emitStopTyping = useSocketStore(state => state.emitStopTyping);
  const emitDmSeen = useSocketStore(state => state.emitDmSeen);
  const typingState = useSocketStore(state => state.typingState);

  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!friendId) return;
    joinDm(friendId);
    return () => leaveDm(friendId);
  }, [friendId, joinDm, leaveDm]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark as seen when new messages arrive
  useEffect(() => {
    if (!friendId || messages.length === 0) return;
    
    const unseenFromFriend = messages.filter(m => !m.fromMe && !m.seenAt);
    if (unseenFromFriend.length > 0) {
      markSeenMutation.mutate({ friendId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFriendMessagesQueryKey(friendId) });
          queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
          emitDmSeen(friendId);
        }
      });
    }
  }, [friendId, messages, markSeenMutation, queryClient, emitDmSeen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !friendId) return;
    
    sendDmMessage(friendId, content.trim());
    setContent("");
    emitStopTyping(friendId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    
    emitTyping(friendId);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitStopTyping(friendId);
    }, 2000);
  };

  const isFriendTyping = Object.keys(typingState[friendId] || {}).length > 0;

  if (!friendId) return null;

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjxwYXRoIGQ9Ik0wIDBINHYxSDB6bTAgMkg0djFIMHoiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9zdmc+')]"></div>
      
      <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card z-10">
        <div>
          <h2 className="text-lg font-bold text-white tracking-widest uppercase">{friendLabel}</h2>
          <p className="text-xs text-muted-foreground font-mono">SECURE_TUNNEL_ESTABLISHED</p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6 z-10" viewportRef={scrollRef}>
        <div className="space-y-6 max-w-4xl mx-auto">
          {isLoading ? (
            <div className="text-muted-foreground font-mono text-sm animate-pulse">
              {'>'} DECRYPTING_LOGS...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground font-mono text-sm">
              {'>'} SECURE_CHANNEL_OPEN.
            </div>
          ) : (
            messages.map((msg) => {
              return (
                <div key={msg.id} className={`flex flex-col ${msg.fromMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-xs font-mono font-bold ${msg.fromMe ? "text-primary" : "text-white"}`}>
                      {msg.fromMe ? "YOU" : friendLabel}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {format(new Date(msg.createdAt), "HH:mm:ss")}
                    </span>
                  </div>
                  
                  <div className={`
                    max-w-[80%] px-4 py-2 text-sm rounded-none border relative group
                    ${msg.fromMe 
                      ? "bg-primary/10 border-primary/30 text-white" 
                      : "bg-card border-border text-white"}
                  `}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    
                    {msg.fromMe && (
                      <div className="absolute -left-6 bottom-1 flex gap-0.5">
                        {msg.seenAt ? (
                          <CheckCheck className="w-4 h-4 text-primary" />
                        ) : (
                          <Check className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      <div className="p-4 bg-card border-t border-border z-10">
        <div className="max-w-4xl mx-auto">
          <div className="h-6 flex items-center mb-2 px-2">
            {isFriendTyping && (
              <span className="text-xs font-mono text-muted-foreground animate-pulse">
                {'>'} {friendLabel} is typing...
              </span>
            )}
          </div>
          <form onSubmit={handleSend} className="flex gap-2">
            <div className="relative flex-1 group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-mono group-focus-within:animate-pulse">
                {'>'}
              </span>
              <Input 
                value={content}
                onChange={handleTyping}
                placeholder="TRANSMIT_MESSAGE..." 
                className="pl-8 bg-background border-border focus-visible:ring-primary font-mono rounded-none h-12"
              />
            </div>
            <Button 
              type="submit" 
              disabled={!content.trim()}
              className="h-12 w-12 p-0 rounded-none bg-primary text-primary-foreground hover:bg-primary/80"
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
