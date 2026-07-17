import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useGetGeneralMessages } from "@workspace/api-client-react";
import { useSocketStore } from "@/store/use-socket";
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
  const typingUsers = Object.entries(generalTyping)
    .filter(([id]) => id !== user?.id)
    .map(([, label]) => label);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Channel header */}
      <div className="px-3 py-1.5 border-b border-border bg-card flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">#general</span>
        <span className="text-xs font-mono text-muted-foreground">anonymous // public</span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-0 font-mono text-sm"
      >
        {isLoading ? (
          <p className="text-muted-foreground text-xs">loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-xs">no messages yet. say hello.</p>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === user?.id;
            const prevMsg = messages[index - 1];
            const showHeader = !prevMsg || prevMsg.senderId !== msg.senderId;

            return (
              <div key={msg.id} className={showHeader && index > 0 ? "mt-3" : "mt-0"}>
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className={`text-xs font-bold ${isMe ? "text-primary" : "text-foreground"}`}>
                      {isMe ? "you" : msg.senderLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(msg.createdAt), "HH:mm")}
                    </span>
                  </div>
                )}
                <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-snug pl-0">
                  {msg.content}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Typing indicator + input */}
      <div className="border-t border-border bg-card">
        {typingUsers.length > 0 && (
          <div className="px-3 pt-1 text-[10px] text-muted-foreground font-mono">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-0">
          <span className="px-2 flex items-center text-muted-foreground font-mono text-sm border-r border-border">
            {'>'}
          </span>
          <input
            value={content}
            onChange={handleTyping}
            placeholder="type a message..."
            className="flex-1 bg-transparent px-2 py-2 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!content.trim()}
            className="px-3 py-2 text-xs font-mono border-l border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            send
          </button>
        </form>
      </div>
    </div>
  );
}
