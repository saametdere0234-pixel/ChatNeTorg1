import { useEffect, useRef } from "react";

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuOverlayProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenuOverlay({ x, y, items, onClose }: ContextMenuOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // close on any click outside
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 32 - 8),
    zIndex: 9999,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-card border border-border font-mono text-xs shadow-none min-w-[150px]"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className={`block w-full text-left px-3 py-1.5 hover:bg-accent ${
            item.danger ? "text-destructive" : "text-foreground"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
