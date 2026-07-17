import { useEffect } from "react";

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between px-2 py-1 bg-card border-b border-border font-mono text-xs">
          <span className="text-muted-foreground">photo</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            [close]
          </button>
        </div>
        <img
          src={src}
          alt="full size"
          className="max-w-[90vw] max-h-[80vh] object-contain border border-border bg-background"
        />
      </div>
    </div>
  );
}
