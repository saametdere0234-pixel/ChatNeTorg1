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
import { useAuthStore, GENERAL_MESSAGES_CACHE_KEY } from "@/store/use-auth";
import { ContextMenuOverlay } from "@/components/ui/context-menu-overlay";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB

interface BlockMessage {
  id: string;
  content: string;
}

interface MsgCtxMenu {
  x: number;
  y: number;
  senderId: string;
  senderLabel: string;
  senderToken: string | null;
  isOwn: boolean;
  blockMessages: BlockMessage[];
  topMessageId: string;
}

interface ImgCtxMenu {
  x: number;
  y: number;
  src: string;
}

interface BlockPickerMenu {
  x: number;
  y: number;
  messages: BlockMessage[];
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

function truncate(text: string, max = 40) {
  if (isImageMsg(text)) return "[image]";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function GeneralChat() {
  // Source of truth: socket store. Events always update it reliably.
  const messages                   = useSocketStore(s => s.generalMessages);
  // Lives in the store (not a component ref) so it survives component
  // unmount/remount when navigating between general and DMs.
  const generalMessagesInitialized = useSocketStore(s => s.generalMessagesInitialized);
  // localStorage-only seed — does NOT set the initialized flag.
  const seedGeneralMessages        = useSocketStore(s => s.seedGeneralMessages);
  // Authoritative API seed — sets the flag so the API never re-seeds this session.
  const initGeneralMessages        = useSocketStore(s => s.initGeneralMessages);

  // Chat history is always server-backed. The delete action is explicit.
  const { data: apiHistory } = useGetGeneralMessages();

  const { data: friends = [] } = useGetFriends();
  const [content, setContent] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgInputRef  = useRef<HTMLInputElement>(null);

  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generalUserCount   = useSocketStore(s => s.generalUserCount);
  const joinGeneral        = useSocketStore(s => s.joinGeneral);
  const leaveGeneral       = useSocketStore(s => s.leaveGeneral);
  const sendGeneralMessage   = useSocketStore(s => s.sendGeneralMessage);
  const deleteGeneralMessage  = useSocketStore(s => s.deleteGeneralMessage);
  const deleteGeneralMessages = useSocketStore(s => s.deleteGeneralMessages);
  const emitTyping         = useSocketStore(s => s.emitTyping);
  const emitStopTyping     = useSocketStore(s => s.emitStopTyping);
  const typingState        = useSocketStore(s => s.typingState);
  const userLabels         = useSocketStore(s => s.userLabels);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressPos     = useRef({ x: 0, y: 0 });
  const [ctxMenu, setCtxMenu]         = useState<MsgCtxMenu | null>(null);
  const [imgCtxMenu, setImgCtxMenu]   = useState<ImgCtxMenu | null>(null);
  const [blockPicker, setBlockPicker] = useState<BlockPickerMenu | null>(null);

  // On mount: seed from localStorage immediately for instant display.
  // Uses seedGeneralMessages — does NOT flip generalMessagesInitialized so the
  // authoritative API fetch can still overwrite stale cache data.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GENERAL_MESSAGES_CACHE_KEY);
      if (raw) seedGeneralMessages(JSON.parse(raw));
    } catch { /* corrupted cache — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // When the API history arrives, seed the store authoritatively —
  // but only ONCE per session (generalMessagesInitialized lives in the store, not
  // a component ref, so remounting this component does not reset it).
  // This prevents: navigating away + back from re-importing stale API data that
  // would resurrect deleted messages.
  useEffect(() => {
    if (apiHistory && !generalMessagesInitialized) {
      initGeneralMessages(apiHistory);
    }
  }, [apiHistory, generalMessagesInitialized, initGeneralMessages]);

  useEffect(() => {
    joinGeneral();
    return () => leaveGeneral();
  }, [joinGeneral, leaveGeneral]);

  // Keep a fast local cache for display while the server remains authoritative.
  useEffect(() => {
    try {
      if (messages.length === 0) {
        localStorage.removeItem(GENERAL_MESSAGES_CACHE_KEY);
      } else {
        localStorage.setItem(GENERAL_MESSAGES_CACHE_KEY, JSON.stringify(messages));
      }
    } catch { /* quota exceeded — ignore */ }
  }, [messages]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // When the on-screen keyboard appears the visual viewport shrinks.
  // Scroll messages to bottom so the latest message stays visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => scrollToBottom();
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    sendGeneralMessage(content.trim());
    setContent("");
    emitStopTyping("general");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    // Re-focus so the on-screen keyboard stays open on mobile
    msgInputRef.current?.focus();
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    emitTyping("general");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitStopTyping("general"), 2000);
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
      toast({ variant: "destructive", title: "Too large", description: "Image must be under 12 MB." });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      sendGeneralMessage(`__img__:${reader.result as string}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const generalTyping = typingState["general"] || {};
  const typingUsers = Object.entries(generalTyping)
    .filter(([id]) => id !== user?.id)
    .map(([, label]) => label);

  const friendIds = new Set(friends.map(f => f.id));

  const getBlock = (startIndex: number): BlockMessage[] => {
    const senderId = messages[startIndex]?.senderId;
    if (!senderId) return [];
    const block: BlockMessage[] = [];
    for (let i = startIndex; i < messages.length; i++) {
      if (messages[i].senderId !== senderId) break;
      block.push({ id: messages[i].id, content: messages[i].content });
    }
    return block;
  };

  const openSenderMenu = (
    x: number, y: number,
    index: number,
    senderId: string,
    senderLabel: string,
    senderToken: string | null,
  ) => {
    const isOwn = senderId === user?.id;
    const blockMessages = isOwn ? getBlock(index) : [];
    const topMessageId = messages[index]?.id ?? "";
    setCtxMenu({ x, y, senderId, senderLabel, senderToken, isOwn, blockMessages, topMessageId });
  };

  const openImageMenu = (x: number, y: number, src: string) => setImgCtxMenu({ x, y, src });

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
        <span className="text-sm sm:text-xs font-mono text-foreground">#general</span>
        <span className="text-sm sm:text-xs font-mono text-muted-foreground">
          {generalUserCount > 0 ? `${generalUserCount} online` : "public"}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 sm:py-2 space-y-0 font-mono text-sm"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm sm:text-xs">no messages yet. say hello.</p>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === user?.id;
            const prevMsg = messages[index - 1];
            const showHeader = !prevMsg || prevMsg.senderId !== msg.senderId;
            const liveLabel = isMe
              ? (user?.displayName ?? "you")
              : (userLabels[msg.senderId] ?? msg.senderLabel);

            return (
              <div key={msg.id} className={showHeader && index > 0 ? "mt-4 sm:mt-3" : "mt-0"}>
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      className={`text-sm sm:text-xs font-bold ${isMe ? "text-primary cursor-pointer hover:text-primary/70" : "text-foreground hover:text-primary cursor-pointer"}`}
                      onClick={(e) => openSenderMenu(e.clientX, e.clientY, index, msg.senderId, liveLabel, (msg as { senderToken?: string | null }).senderToken ?? null)}
                      onContextMenu={(e) => { e.preventDefault(); openSenderMenu(e.clientX, e.clientY, index, msg.senderId, liveLabel, (msg as { senderToken?: string | null }).senderToken ?? null); }}
                    >
                      {liveLabel}
                    </span>
                    <span className="text-xs sm:text-[10px] text-muted-foreground">
                      {format(new Date(msg.createdAt), "HH:mm")}
                    </span>
                  </div>
                )}
                {isImageMsg(msg.content) ? (
                  <img
                    src={imgSrc(msg.content)}
                    alt="shared image"
                    className="max-w-[240px] sm:max-w-xs max-h-56 sm:max-h-48 border border-border mt-0.5 cursor-pointer hover:opacity-80"
                    style={{ display: "block", WebkitTouchCallout: "none" }}
                    onClick={() => setLightboxSrc(imgSrc(msg.content))}
                    onContextMenu={(e) => { e.preventDefault(); openImageMenu(e.clientX, e.clientY, imgSrc(msg.content)); }}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      longPressPos.current = { x: t.clientX, y: t.clientY };
                      longPressTimer.current = setTimeout(() => openImageMenu(longPressPos.current.x, longPressPos.current.y, imgSrc(msg.content)), 500);
                    }}
                    onTouchEnd={() => clearTimeout(longPressTimer.current)}
                    onTouchMove={() => clearTimeout(longPressTimer.current)}
                    title="Tap to view · Long-press or right-click to download"
                  />
                ) : (
                  <p className="text-base sm:text-sm text-foreground whitespace-pre-wrap break-words leading-snug pl-0">
                    {msg.content}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Typing indicator + input */}
      <div className="border-t border-border bg-card shrink-0">
        {typingUsers.length > 0 && (
          <div className="px-3 pt-1 text-xs sm:text-[10px] text-muted-foreground font-mono">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-0 h-12 sm:h-9">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 sm:px-2 flex items-center text-muted-foreground font-mono text-base sm:text-sm border-r border-border hover:text-foreground shrink-0"
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
            onFocus={() => setTimeout(() => scrollToBottom(), 300)}
            enterKeyHint="send"
            placeholder="type a message..."
            className="flex-1 bg-transparent px-3 sm:px-2 py-2 text-base sm:text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground min-w-0"
          />
          <button
            type="submit"
            disabled={!content.trim()}
            className="px-4 sm:px-3 py-2 text-sm sm:text-xs font-mono border-l border-border text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0"
          >
            send
          </button>
        </form>
      </div>

      {/* Sender context menu */}
      {ctxMenu && (
        <ContextMenuOverlay
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={ctxMenu.isOwn ? [
            {
              label: "Delete message",
              danger: true,
              onClick: () => deleteGeneralMessage(ctxMenu.topMessageId),
            },
            ...(ctxMenu.blockMessages.length > 1 ? [
              {
                label: "Delete all block",
                danger: true,
                onClick: () => deleteGeneralMessages(ctxMenu.blockMessages.map(m => m.id)),
              },
              {
                label: "Pick a message in block",
                onClick: () => setBlockPicker({ x: ctxMenu.x + 160, y: ctxMenu.y, messages: ctxMenu.blockMessages }),
              },
            ] : []),
          ] : [
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
              { label: `Already friends`, onClick: () => {} },
            ] : []),
            ...(ctxMenu.senderToken === null ? [
              { label: `Guest — no ID`, onClick: () => {} },
            ] : []),
          ]}
        />
      )}

      {/* Block message picker */}
      {blockPicker && (
        <BlockPickerOverlay
          x={blockPicker.x}
          y={blockPicker.y}
          messages={blockPicker.messages}
          onSelect={(id) => { deleteGeneralMessage(id); setBlockPicker(null); }}
          onClose={() => setBlockPicker(null)}
        />
      )}

      {/* Image context menu */}
      {imgCtxMenu && (
        <ContextMenuOverlay
          x={imgCtxMenu.x}
          y={imgCtxMenu.y}
          onClose={() => setImgCtxMenu(null)}
          items={[
            { label: "Download image", onClick: () => downloadImage(imgCtxMenu.src) },
            { label: "View full size",  onClick: () => setLightboxSrc(imgCtxMenu.src) },
          ]}
        />
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

function BlockPickerOverlay({
  x, y, messages, onSelect, onClose,
}: {
  x: number;
  y: number;
  messages: BlockMessage[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 220),
    top:  Math.min(y, window.innerHeight - messages.length * 44 - 40),
    zIndex: 9999,
    maxHeight: 320,
    overflowY: "auto",
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-card border border-border font-mono text-sm sm:text-xs shadow-lg min-w-[200px]"
    >
      <div className="px-3 py-2 text-xs sm:text-[10px] text-muted-foreground border-b border-border">
        pick message to delete
      </div>
      {messages.map((msg, i) => (
        <button
          key={msg.id}
          onClick={() => onSelect(msg.id)}
          className="block w-full text-left px-3 py-3 sm:py-1.5 hover:bg-accent text-destructive"
        >
          {i + 1}. {truncate(msg.content)}
        </button>
      ))}
    </div>
  );
}
