import type { CSSProperties, ReactNode } from 'react';

/** 分段切換鈕 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  /** null：沒有選任何一個（例如手寫頁在練漢字時，「平假名／片假名」都不算選了）；按任何一個都會換過去 */
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segc segc-${size}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => o.value !== value && onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 開關 */
export function Switch({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="switch" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** 練習格（原稿紙的方格，淡淡的字源在底下） */
export function Masu({ ch, ghost, className = '', style }: { ch: string; ghost?: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={`masu ${className}`} style={style}>
      {ghost ? (
        <span className="ghost" aria-hidden="true">
          {ghost}
        </span>
      ) : null}
      <span className="kana" lang="ja">
        {ch}
      </span>
    </span>
  );
}

/** 紅色印章 */
export function Stamp({ children }: { children: ReactNode }) {
  return <span className="stamp">{children}</span>;
}

/** 進度條 */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="meter-bar" role="img" aria-label={`${label} ${value} / ${max}`}>
      <span style={{ width: `${pct.toFixed(1)}%` }} />
    </span>
  );
}
