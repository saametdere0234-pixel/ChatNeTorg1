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
    const handler = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Close on both desktop click and mobile touch outside the menu
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  // On mobile, use larger item height and wider menu for comfortable tapping
  const isMobile = window.innerWidth < 640;
  const itemHeight = isMobile ? 52 : 32;
  const menuWidth  = isMobile ? 230 : 165;

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth  - menuWidth  - 8),
    top:  Math.min(y, window.innerHeight - items.length * itemHeight - 16),
    zIndex: 9999,
    minWidth: menuWidth,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-card border border-border font-mono shadow-lg"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className={`block w-full text-left px-4 py-3 sm:py-2 text-sm sm:text-xs hover:bg-accent ${
            item.danger ? "text-destructive" : "text-foreground"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
