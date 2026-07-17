import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  useGetGeneralMessages,
  useGetFriends,
  getGetFriendsQueryKey,
  addFriend,
} from "@workspace/api-client-react";
import { useSocketStore } from "@/store/use-socket";
import { useAuthContext } from "@/hooks/use-auth-context";
import { ContextMenuOverlay } from "@/components/ui/context-menu-overlay";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface MsgCtxMenu {
  x: number;
  y: number;
  senderId: string;
  senderLabel: string;
  senderToken: string | null;
}

// Detect image messages
function isImageMsg(content: string) {
  return content.startsWith("__img__:");
}
function imgSrc(content: string) {
  return content.slice("__img__:".length);
}

export function GeneralChat() {
  const { data: messages = [], isLoading } = useGetGeneralMessages();
  const { data: friends = [] } = useGetFriends();
  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const joinGeneral = useSocketStore(state => state.joinGeneral);
  const leaveGeneral = useSocketStore(state => state.leaveGeneral);
  const sendGeneralMessage = useSocketStore(state => state.sendGeneralMessage);
  const emitTyping = useSocketStore(state => state.emitTyping);
  const emitStopTyping = useSocketStore(state => state.emitStopTyping);
  const typingState = useSocketStore(state => state.typingState);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [ctxMenu, setCtxMenu] = useState<MsgCtxMenu | null>(null);

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
      sendGeneralMessage(`__img__:${dataUrl}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const generalTyping = typingState["general"] || {};
  const typingUsers = Object.entries(generalTyping)
    .filter(([id]) => id !== user?.id)
    .map(([, label]) => label);

  const friendIds = new Set(friends.map(f => f.id));

  const handleSenderContextMenu = (
    e: React.MouseEvent,
    senderId: string,
    senderLabel: string,
    senderToken: string | null,
  ) => {
    if (senderId === user?.id) return; // no menu for yourself
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, senderId, senderLabel, senderToken });
  };

  const handleAddFromCtx = (token: string, label: string) => {
    addFriend({ token }).then((newFriend) => {
      queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
      toast({ title: "Friend added", description: `${newFriend.label} added.` });
    }).catch((err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast({ variant: "destructive", title: "Failed", description: msg ?? "Could not add friend." });
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Channel header */}
      <div className="px-3 py-1.5 border-b border-border bg-card flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">#general</span>
        <span className="text-xs font-mono text-muted-foreground">public</span>
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
                    <span
                      className={`text-xs font-bold ${isMe ? "text-primary" : "text-foreground hover:text-primary"} ${!isMe ? "cursor-pointer" : ""}`}
                      onContextMenu={(e) => handleSenderContextMenu(e, msg.senderId, msg.senderLabel, (msg as { senderToken?: string | null }).senderToken ?? null)}
                    >
                      {isMe ? "you" : msg.senderLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(msg.createdAt), "HH:mm")}
                    </span>
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
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-snug pl-0">
                    {msg.content}
                  </p>
                )}
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

      {/* Right-click context menu for message senders */}
      {ctxMenu && (
        <ContextMenuOverlay
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(ctxMenu.senderToken ? [
              {
                label: `ID: ${ctxMenu.senderToken}`,
                onClick: () => {
                  navigator.clipboard.writeText(ctxMenu.senderToken!);
                  toast({ title: "Copied", description: "ID copied to clipboard." });
                },
              },
            ] : []),
            ...(!friendIds.has(ctxMenu.senderId) && ctxMenu.senderToken ? [
              {
                label: `Add ${ctxMenu.senderLabel} as friend`,
                onClick: () => handleAddFromCtx(ctxMenu.senderToken!, ctxMenu.senderLabel),
              },
            ] : []),
            ...(friendIds.has(ctxMenu.senderId) ? [
              {
                label: `Already friends`,
                onClick: () => {},
              },
            ] : []),
            ...(ctxMenu.senderToken === null ? [
              {
                label: `Guest — no ID`,
                onClick: () => {},
              },
            ] : []),
          ]}
        />
      )}
    </div>
  );
}
