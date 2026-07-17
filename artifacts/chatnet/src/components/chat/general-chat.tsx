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
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

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

// Sub-picker for "Pick a message in block"
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
  const { data: messages = [], isLoading } = useGetGeneralMessages();
  const { data: friends = [] } = useGetFriends();
  const [content, setContent] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generalUserCount = useSocketStore(state => state.generalUserCount);
  const joinGeneral = useSocketStore(state => state.joinGeneral);
  const leaveGeneral = useSocketStore(state => state.leaveGeneral);
  const sendGeneralMessage = useSocketStore(state => state.sendGeneralMessage);
  const deleteGeneralMessage = useSocketStore(state => state.deleteGeneralMessage);
  const deleteGeneralMessages = useSocketStore(state => state.deleteGeneralMessages);
  const emitTyping = useSocketStore(state => state.emitTyping);
  const emitStopTyping = useSocketStore(state => state.emitStopTyping);
  const typingState = useSocketStore(state => state.typingState);
  const userLabels = useSocketStore(state => state.userLabels);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [ctxMenu, setCtxMenu] = useState<MsgCtxMenu | null>(null);
  const [imgCtxMenu, setImgCtxMenu] = useState<ImgCtxMenu | null>(null);
  const [blockPicker, setBlockPicker] = useState<BlockPickerMenu | null>(null);

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
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast({ variant: "destructive", title: "Invalid type", description: "Only JPG and PNG files are supported." });
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

  // Compute the block (consecutive messages from same sender) starting at index
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

  const handleSenderContextMenu = (
    e: React.MouseEvent,
    index: number,
    senderId: string,
    senderLabel: string,
    senderToken: string | null,
  ) => {
    e.preventDefault();
    const isOwn = senderId === user?.id;
    const blockMessages = isOwn ? getBlock(index) : [];
    const topMessageId = messages[index]?.id ?? "";
    setCtxMenu({ x: e.clientX, y: e.clientY, senderId, senderLabel, senderToken, isOwn, blockMessages, topMessageId });
  };

  const handleImageContextMenu = (e: React.MouseEvent, src: string) => {
    e.preventDefault();
    setImgCtxMenu({ x: e.clientX, y: e.clientY, src });
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
        <span className="text-xs font-mono text-muted-foreground">
          {generalUserCount > 0 ? `${generalUserCount} online` : "public"}
        </span>
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
            const liveLabel = isMe
              ? (user?.displayName ?? "you")
              : (userLabels[msg.senderId] ?? msg.senderLabel);

            return (
              <div key={msg.id} className={showHeader && index > 0 ? "mt-3" : "mt-0"}>
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      className={`text-xs font-bold ${isMe ? "text-primary cursor-pointer hover:text-primary/70" : "text-foreground hover:text-primary cursor-pointer"}`}
                      onContextMenu={(e) => handleSenderContextMenu(e, index, msg.senderId, liveLabel, (msg as { senderToken?: string | null }).senderToken ?? null)}
                    >
                      {liveLabel}
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
                    className="max-w-[200px] sm:max-w-xs max-h-48 border border-border mt-0.5 cursor-pointer hover:opacity-80"
                    style={{ display: "block" }}
                    onClick={() => setLightboxSrc(imgSrc(msg.content))}
                    onContextMenu={(e) => handleImageContextMenu(e, imgSrc(msg.content))}
                    title="Click to view · Right-click to download"
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
            className="px-2 flex items-center text-muted-foreground font-mono text-sm border-r border-border hover:text-foreground shrink-0"
            title="Upload image (JPG/PNG, max 2 MB)"
          >
            {'>'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            value={content}
            onChange={handleTyping}
            placeholder="type a message..."
            className="flex-1 bg-transparent px-2 py-2 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground h-9 min-w-0"
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

      {/* Right-click context menu */}
      {ctxMenu && (
        <ContextMenuOverlay
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={ctxMenu.isOwn ? [
            {
              label: "Delete message",
              danger: true,
              onClick: () => {
                deleteGeneralMessage(ctxMenu.topMessageId);
              },
            },
            ...(ctxMenu.blockMessages.length > 1 ? [
              {
                label: "Delete all block",
                danger: true,
                onClick: () => {
                  deleteGeneralMessages(ctxMenu.blockMessages.map(m => m.id));
                },
              },
              {
                label: "Pick a message in block",
                onClick: () => {
                  setBlockPicker({ x: ctxMenu.x + 160, y: ctxMenu.y, messages: ctxMenu.blockMessages });
                },
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

      {/* Block message picker overlay */}
      {blockPicker && (
        <BlockPickerOverlay
          x={blockPicker.x}
          y={blockPicker.y}
          messages={blockPicker.messages}
          onSelect={(id) => {
            deleteGeneralMessage(id);
            setBlockPicker(null);
          }}
          onClose={() => setBlockPicker(null)}
        />
      )}

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

function BlockPickerOverlay({
  x,
  y,
  messages,
  onSelect,
  onClose,
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - messages.length * 30 - 40),
    zIndex: 9999,
    maxHeight: 280,
    overflowY: "auto",
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-card border border-border font-mono text-xs shadow-none min-w-[200px]"
    >
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border">
        pick message to delete
      </div>
      {messages.map((msg, i) => (
        <button
          key={msg.id}
          onClick={() => onSelect(msg.id)}
          className="block w-full text-left px-3 py-1.5 hover:bg-accent text-destructive"
        >
          {i + 1}. {truncate(msg.content)}
        </button>
      ))}
    </div>
  );
}
