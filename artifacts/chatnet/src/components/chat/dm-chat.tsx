import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useGetFriendMessages, useMarkSeen, getGetFriendMessagesQueryKey, getGetFriendsQueryKey } from "@workspace/api-client-react";
import { useSocketStore } from "@/store/use-socket";
import { useAuthContext } from "@/hooks/use-auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ContextMenuOverlay } from "@/components/ui/context-menu-overlay";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

interface DmChatProps {
  friendId: string;
  friendLabel: string;
}

interface ImgCtxMenu {
  x: number;
  y: number;
  src: string;
}

function isImageMsg(content: string) {
  return content.startsWith("__img__:");
}
function imgSrc(content: string) {
  return content.slice("__img__:".length);
}

function downloadImage(src: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = `chatnet-image-${Date.now()}.jpg`;
  a.click();
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [imgCtxMenu, setImgCtxMenu] = useState<ImgCtxMenu | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuthContext();
  const joinDm = useSocketStore(state => state.joinDm);
  const leaveDm = useSocketStore(state => state.leaveDm);
  const sendDmMessage = useSocketStore(state => state.sendDmMessage);
  const emitTyping = useSocketStore(state => state.emitTyping);
  const emitStopTyping = useSocketStore(state => state.emitStopTyping);
  const emitDmSeen = useSocketStore(state => state.emitDmSeen);
  const typingState = useSocketStore(state => state.typingState);
  const userLabels = useSocketStore(state => state.userLabels);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!friendId) return;
    joinDm(friendId);
    return () => leaveDm(friendId);
  }, [friendId, joinDm, leaveDm]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // When the on-screen keyboard appears the visual viewport shrinks.
  // Scroll messages to the bottom so the latest message stays visible
  // above the keyboard rather than being hidden under it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => scrollToBottom();
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

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
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid type", description: "Only image files are supported." });
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ variant: "destructive", title: "Too large", description: "Image must be under 2 MB." });
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

  const handleImageContextMenu = (e: React.MouseEvent, src: string) => {
    e.preventDefault();
    setImgCtxMenu({ x: e.clientX, y: e.clientY, src });
  };

  const isFriendTyping = Object.keys(typingState[friendId] || {}).length > 0;
  // Use live label from socket store if the friend has renamed
  const liveFriendLabel = userLabels[friendId] ?? friendLabel;

  if (!friendId) return null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* DM header */}
      <div className="px-3 py-1.5 border-b border-border bg-card flex items-center justify-between">
        <span className="text-xs font-mono text-foreground">{liveFriendLabel}</span>
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
                      {msg.fromMe ? (user?.displayName ?? "you") : liveFriendLabel}
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
                    className="max-w-[200px] sm:max-w-xs max-h-48 border border-border mt-0.5 cursor-pointer hover:opacity-80"
                    style={{ display: "block" }}
                    onClick={() => setLightboxSrc(imgSrc(msg.content))}
                    onContextMenu={(e) => handleImageContextMenu(e, imgSrc(msg.content))}
                    title="Click to view · Right-click to download"
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
      <div className="border-t border-border bg-card shrink-0">
        {isFriendTyping && (
          <div className="px-3 pt-1 text-[10px] text-muted-foreground font-mono">
            {liveFriendLabel} is typing...
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-0 h-11 sm:h-9">
          {/* Image upload trigger */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 sm:px-2 flex items-center text-muted-foreground font-mono text-sm border-r border-border hover:text-foreground shrink-0"
            title="Upload image"
          >
            {'>'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={msgInputRef}
            value={content}
            onChange={handleTyping}
            onFocus={() => {
              // Delay allows the keyboard animation to finish before scrolling
              setTimeout(() => scrollToBottom(), 300);
            }}
            enterKeyHint="send"
            placeholder="type a message..."
            className="flex-1 bg-transparent px-2 py-2 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground h-11 sm:h-9 min-w-0"
          />
          <button
            type="submit"
            disabled={!content.trim()}
            className="px-3 py-2 text-xs font-mono border-l border-border text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0"
          >
            send
          </button>
        </form>
      </div>

      {/* Right-click context menu for images */}
      {imgCtxMenu && (
        <ContextMenuOverlay
          x={imgCtxMenu.x}
          y={imgCtxMenu.y}
          onClose={() => setImgCtxMenu(null)}
          items={[
            {
              label: "Download image",
              onClick: () => downloadImage(imgCtxMenu.src),
            },
            {
              label: "View full size",
              onClick: () => setLightboxSrc(imgCtxMenu.src),
            },
          ]}
        />
      )}

      {/* Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
