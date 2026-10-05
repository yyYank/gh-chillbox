import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 150;

type Props = {
  content: string;
  className?: string;
  children: ReactNode;
};

// ブラウザ標準の title より早く出すためのツールチップ。
// 親が overflow で切れても見えるよう、body 直下に position: fixed で描画する
export function Tooltip({ content, className, children }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const show = () => {
    if (!content) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) {
        setPos({ x: rect.left, y: rect.bottom + 4 });
      }
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    clearTimer();
    setPos(null);
  };

  return (
    <div ref={anchorRef} className={className} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
      {children}
      {pos &&
        content &&
        createPortal(
          <div className="tooltip" role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
