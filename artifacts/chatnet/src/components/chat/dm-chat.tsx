import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useGetFriendMessages, useMarkSeen, getGetFriendMessagesQueryKey, getGetFriendsQueryKey } from "@workspace/api-client-react";
import { useSocketStore } from "@/store/use-socket";
import { useAuthContext } from "@/hooks/use-auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface DmChatProps {
  friendId: string;
  friendLabel: string;
}

function isImageMsg(content: string) {
  return content.startsWith("__img__:");
}
function imgSrc(content: string) {
  return content.slice("__img__:".length);
}

export function DmChat({ friendId, friendLabel }: DmChatProps) {
  const { data: messages = [], isLoading } = useGetFriendMessages(friendId, {
    query: {
      enabled: !!friendId,
      queryKey: getGetFriendMessagesQueryKey(friendId),
    },
  });
  const markSeenMutation = useMarkSeen();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuthContext();
  const joinDm = useSocketStore(state => state.joinDm);
  const leaveDm = useSocketStore(state => state.leaveDm);
  const sendDmMessage = useSocketStore(state => state.sendDmMessage);
  const emitTyping = useSocketStore(state => state.emitTyping);
  const emitStopTyping = useSocketStore(state => state.emitStopTyping);
  const emitDmSeen = useSocketStore(state => state.emitDmSeen);
  const typingState = useSocketStore(state => state.typingState);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  useEffect(() => {
    if (!friendId || messages.length === 0) return;
    const unseenFromFriend = messages.filter(m => !m.fromMe && !m.seenAt);
    if (unseenFromFriend.length > 0) {
      markSeenMutation.mutate({ friendId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFriendMessagesQueryKey(friendId) });
          queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
          emitDmSeen(friendId);
        },
      });
    }
  }, [friendId, messages]);

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      toast({ variant: "destructive", title: "Too large", description: "Image must be under 300 KB." });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      sendDmMessage(friendId, `__img__:${dataUrl}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const isFriendTyping = Object.keys(typingState[friendId] || {}).length > 0;

  if (!friendId) return null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* DM header */}
      <div className="px-3 py-1.5 border-b border-border bg-card flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">{friendLabel}</span>
        <span className="text-xs font-mono text-muted-foreground">private</span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-sm"
      >
        {isLoading ? (
          <p className="text-muted-foreground text-xs">loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-xs">no messages yet.</p>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = messages[index - 1];
            const showHeader = !prevMsg || prevMsg.fromMe !== msg.fromMe;

            return (
              <div key={msg.id} className={showHeader && index > 0 ? "mt-3" : "mt-0"}>
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className={`text-xs font-bold ${msg.fromMe ? "text-primary" : "text-foreground"}`}>
                      {msg.fromMe ? (user?.displayName ?? "you") : friendLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(msg.createdAt), "HH:mm")}
                    </span>
                    {msg.fromMe && (
                      <span className="text-[10px] text-muted-foreground">
                        {msg.seenAt ? "seen" : ""}
                      </span>
                    )}
                  </div>
                )}
                {isImageMsg(msg.content) ? (
                  <img
                    src={imgSrc(msg.content)}
                    alt="shared image"
                    className="max-w-xs max-h-48 border border-border mt-0.5"
                    style={{ display: "block" }}
                  />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-snug">
                    {msg.content}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Typing + input */}
      <div className="border-t border-border bg-card">
        {isFriendTyping && (
          <div className="px-3 pt-1 text-[10px] text-muted-foreground font-mono">
            {friendLabel} is typing...
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-0 h-9">
          {/* Image upload trigger */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2 flex items-center text-muted-foreground font-mono text-sm border-r border-border hover:text-foreground"
            title="Upload image (JPG/PNG, max 300 KB)"
          >
            {'>'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            value={content}
            onChange={handleTyping}
            placeholder="type a message..."
            className="flex-1 bg-transparent px-2 py-2 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground h-9"
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
