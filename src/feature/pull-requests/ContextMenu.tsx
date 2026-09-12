import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  onHide: () => void;
  onClose: () => void;
};

export function ContextMenu({ x, y, onHide, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ top: y, left: x }}>
      <button type="button" onClick={onHide}>
        PRを非表示にする
      </button>
    </div>
  );
}
