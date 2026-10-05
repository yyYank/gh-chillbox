import { X } from "lucide-react";

type Props = {
  tabs: number[];
  active: number | null;
  titles: Record<number, string>;
  onSelect: (prNumber: number) => void;
  onClose: (prNumber: number) => void;
};

export function PrTabBar({ tabs, active, titles, onSelect, onClose }: Props) {
  return (
    <div className="pr-tab-bar" role="tablist">
      {tabs.map((n) => (
        <div key={n} className={`pr-tab${n === active ? " active" : ""}`} title={titles[n]}>
          <button
            type="button"
            className="pr-tab-label"
            role="tab"
            aria-selected={n === active}
            onClick={() => onSelect(n)}
          >
            <span className="pr-tab-number">#{n}</span>
            {titles[n] && <span className="pr-tab-title">{titles[n]}</span>}
          </button>
          <button type="button" className="pr-tab-close" onClick={() => onClose(n)} title="タブを閉じる">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
