import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useGetGeneralMessages, getGetGeneralMessagesQueryKey } from "@workspace/api-client-react";
import { useSocketStore } from "@/store/use-socket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Send } from "lucide-react";
import { useAuthContext } from "@/hooks/use-auth-context";

export function GeneralChat() {
  const { data: messages = [], isLoading } = useGetGeneralMessages();
  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthContext();
  const joinGeneral = useSocketStore(state => state.joinGeneral);
  const leaveGeneral = useSocketStore(state => state.leaveGeneral);
  const sendGeneralMessage = useSocketStore(state => state.sendGeneralMessage);
  const emitTyping = useSocketStore(state => state.emitTyping);
  const emitStopTyping = useSocketStore(state => state.emitStopTyping);
  const typingState = useSocketStore(state => state.typingState);

  // Typing debounce
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    joinGeneral();
    return () => leaveGeneral();
  }, [joinGeneral, leaveGeneral]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    
    sendGeneralMessage(content.trim());
    setContent("");
    emitStopTyping("general");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    
    emitTyping("general");
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitStopTyping("general");
    }, 2000);
  };

  const generalTyping = typingState["general"] || {};
  const typingUsers = Object.entries(generalTyping).filter(([id]) => id !== user?.id).map(([, label]) => label);

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Background terminal noise effect */}
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjxwYXRoIGQ9Ik0wIDBINHYxSDB6bTAgMkg0djFIMHoiIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9zdmc+')]"></div>
      
      <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card z-10">
        <div>
          <h2 className="text-lg font-bold text-white tracking-widest uppercase">General_Channel</h2>
          <p className="text-xs text-muted-foreground font-mono">ENCRYPTED // ANONYMOUS // PUBLIC</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span className="text-xs font-mono text-primary uppercase">Connected</span>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6 z-10" viewportRef={scrollRef}>
        <div className="space-y-6 max-w-4xl mx-auto">
          {isLoading ? (
            <div className="text-muted-foreground font-mono text-sm animate-pulse">
              {'>'} SYNCING_MESSAGES...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground font-mono text-sm">
              {'>'} CHANNEL_EMPTY. BE_THE_FIRST.
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className={`text-xs font-mono font-bold ${isMe ? "text-primary" : "text-secondary-foreground"}`}>
                      {isMe ? "YOU" : msg.senderLabel}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {format(new Date(msg.createdAt), "HH:mm:ss")}
                    </span>
                  </div>
                  
                  <div className={`
                    max-w-[80%] px-4 py-2 text-sm rounded-none border relative group
                    ${isMe 
                      ? "bg-primary/10 border-primary/30 text-white" 
                      : "bg-card border-border text-white"}
                  `}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    
                    {/* Seen indicator for my messages */}
                    {isMe && msg.seenByMe && (
                      <div className="absolute -left-6 bottom-1 flex gap-0.5 text-primary">
                        <Check className="w-3 h-3" />
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
            {typingUsers.length > 0 && (
              <span className="text-xs font-mono text-primary animate-pulse">
                {'>'} {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
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
