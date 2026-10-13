/**
 * 學習紀錄頁的圖表（純 SVG／HTML，不用圖表套件）。
 * 顏色都用 CSS 變數（tokens.css 的 --heat-*、--series-*），深色模式有自己的一組；
 * 細線條、單一基線、滑過（或點一下）有提示；每張圖下面都有「看數字」的表格，提示不是唯一的讀法。
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { CalendarDay, Point } from '../lib/stats';

/* ---------------- 提示框 ---------------- */

interface TipLine {
  text: string;
  /** 有顏色時前面畫一小段線（代表哪一條線） */
  color?: string;
  strong?: boolean;
}
interface Tip {
  x: number;
  y: number;
  /** 圖表寬度（提示框靠邊時往內收） */
  w: number;
  lines: TipLine[];
}

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const open = tip !== null;
  const show = (e: { clientX: number; clientY: number }, lines: TipLine[]) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, lines });
  };
  /** 滑鼠移開就收起來；手指點的不算（手指一放開就算「離開」），要點圖表以外的地方才收 */
  const hide = (e?: { pointerType?: string }) => {
    if (e?.pointerType !== 'touch') setTip(null);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setTip(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  return { ref, show, hide, open, box: <TipBox tip={tip} /> };
}

function TipBox({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  // 提示框寬約 160px：靠邊時往內收，不超出圖表
  const left = Math.min(Math.max(tip.x, 84), Math.max(84, tip.w - 84));
  return (
    <div className="viz-tip" style={{ left, top: tip.y }} role="presentation">
      {tip.lines.map((l, i) => (
        <p key={i} className={l.strong ? 'strong' : undefined}>
          {l.color ? <span className="viz-key" style={{ background: l.color }} /> : null}
          {l.text}
        </p>
      ))}
    </div>
  );
}

/** 「看數字」：每張圖的表格版本 */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="viz-table">
      <summary>看數字</summary>
      {/* 手機上表格比畫面寬時可以左右捲動：捲動的框要能用鍵盤選到 */}
      <div className="viz-table-scroll" tabIndex={0} role="region" aria-label={`${caption}（表格）`}>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{typeof c === 'number' ? c.toLocaleString('zh-TW') : c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const md = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
export const mdw = (t: number) => `${md(t)}（${WEEK[new Date(t).getDay()]}）`;

/* ---------------- 學習日曆 ---------------- */

const CELL = 12;
const STEP = 15;
const LEFT = 20;
const TOP = 16;

export function activityLines(day: CalendarDay): TipLine[] {
  const a = day.act;
  const parts = [
    a.kana ? `假名 ${a.kana} 題` : '',
    a.review ? `單字 ${a.review} 次` : '',
    a.writing ? `手寫 ${a.writing} 字` : '',
    a.lesson ? `完成 ${a.lesson} 課` : '',
    a.tutor ? `AI 家教 ${a.tutor} 次` : '',
  ].filter(Boolean);
  return [
    { text: a.total ? `練習 ${a.total} 次` : '沒有學習', strong: true },
    { text: mdw(day.date) },
    ...(parts.length ? [{ text: parts.join('、') }] : []),
  ];
}

export function Heatmap({ weeks, todayKey, label }: { weeks: CalendarDay[][]; todayKey: string; label: string }) {
  const { ref, show, hide, box } = useTip();
  const width = LEFT + weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const byKey = new Map(weeks.flat().map((d) => [d.key, d]));
  // 月份標在那個月第一次出現的那一週上方（太擠就跳過）
  const months: { x: number; text: string }[] = [];
  weeks.forEach((col, w) => {
    const m = new Date(col[0].date).getMonth();
    const prev = w ? new Date(weeks[w - 1][0].date).getMonth() : -1;
    const x = LEFT + w * STEP;
    if (m !== prev && (!months.length || x - months[months.length - 1].x >= 3 * STEP)) months.push({ x, text: `${m + 1}月` });
  });
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const key = (e.target as Element).getAttribute?.('data-k');
    const day = key ? byKey.get(key) : undefined;
    if (day) show(e, activityLines(day));
    else hide();
  };
  return (
    <div className="viz-fig" ref={ref}>
      <svg
        className="heatmap"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: width * 1.6 }}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={hide}
      >
        {months.map((m) => (
          <text key={m.x} x={m.x} y={10} className="viz-axis">
            {m.text}
          </text>
        ))}
        {[1, 3, 5].map((r) => (
          <text key={r} x={0} y={TOP + r * STEP + CELL - 2} className="viz-axis">
            {WEEK[r]}
          </text>
        ))}
        {weeks.map((col, w) =>
          col.map((d, r) =>
            d.future ? null : (
              <rect
                key={d.key}
                data-k={d.key}
                x={LEFT + w * STEP}
                y={TOP + r * STEP}
                width={CELL}
                height={CELL}
                rx={3}
                className={`hm hm-${d.level}${d.key === todayKey ? ' hm-today' : ''}`}
              />
            ),
          ),
        )}
      </svg>
      <p className="viz-scale" aria-hidden="true">
        少
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`hm-swatch hm-${l}`} />
        ))}
        多
      </p>
      {box}
    </div>
  );
}

/* ---------------- 每週的直條圖（小圖並排，各自的刻度） ---------------- */

/** 上面圓角 4px、底部直角的直條 */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export interface Column {
  label: string;
  value: number;
}

export function Columns({ data, unit, max, color, label }: { data: Column[]; unit: string; max: number; color: string; label: string }) {
  const { ref, show, hide, open, box } = useTip();
  const [hoverAt, setHover] = useState<number | null>(null);
  const hover = open ? hoverAt : null;
  const W = 260;
  const H = 132;
  const L = 30;
  const T = 18;
  const B = 108;
  const band = (W - L - 2) / data.length;
  const bw = Math.min(24, band * 0.62);
  const y = (v: number) => B - (v / max) * (B - T);
  const last = data.length - 1;
  return (
    <div className="viz-fig" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={hide}>
        <line x1={L} x2={W} y1={T} y2={T} className="viz-grid" />
        <line x1={L} x2={W} y1={B} y2={B} className="viz-base" />
        <text x={L - 6} y={T + 4} className="viz-axis" textAnchor="end">
          {max.toLocaleString('zh-TW')}
        </text>
        <text x={L - 6} y={B + 4} className="viz-axis" textAnchor="end">
          0
        </text>
        {data.map((d, i) => {
          const x = L + i * band + (band - bw) / 2;
          const h = Math.max(0, B - y(d.value));
          const onShow = (e: ReactPointerEvent) => {
            setHover(i);
            show(e, [{ text: `${d.value.toLocaleString('zh-TW')} ${unit}`, strong: true }, { text: `${d.label} 那週` }]);
          };
          return (
            <g key={d.label}>
              {h > 0 ? <path d={barPath(x, B - h, bw, h)} fill={color} className={hover === i ? 'is-hover' : undefined} /> : null}
              {/* 碰觸範圍比直條大：整個欄位的高度 */}
              <rect x={L + i * band} y={T - 14} width={band} height={B - T + 14} className="viz-hit" onPointerMove={onShow} onPointerDown={onShow} />
            </g>
          );
        })}
        {/* 只標這一週的數字 */}
        <text x={L + last * band + band / 2} y={y(data[last].value) - 6} className="viz-label" textAnchor="middle">
          {data[last].value.toLocaleString('zh-TW')}
        </text>
        <text x={L + band / 2} y={H - 6} className="viz-axis" textAnchor="middle">
          {data[0].label}
        </text>
        <text x={L + last * band + band / 2} y={H - 6} className="viz-axis" textAnchor="middle">
          這週
        </text>
      </svg>
      {box}
    </div>
  );
}

/* ---------------- 進步曲線 ---------------- */

export interface Series {
  name: string;
  color: string;
  points: Point[];
}

export function LineChart({ series, max, unit, label, legend = true }: { series: Series[]; max: number; unit: string; label: string; legend?: boolean }) {
  const { ref, show, hide, open, box } = useTip();
  const [atIdx, setAt] = useState<number | null>(null);
  const at = open ? atIdx : null;
  const W = 320;
  const H = 160;
  const L = 30;
  const R = 40;
  const T = 12;
  const B = 132;
  const n = series[0]?.points.length ?? 0;
  const x = (i: number) => (n <= 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const y = (v: number) => B - (v / max) * (B - T);
  const ticks = [0, max / 2, max];
  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg || !n) return;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - L) / (W - L - R)) * (n - 1));
    const idx = Math.min(n - 1, Math.max(0, i));
    setAt(idx);
    show(e, [
      { text: mdw(series[0].points[idx].date) },
      ...series.map((s) => ({ text: `${s.points[idx].value.toLocaleString('zh-TW')} ${unit} · ${s.name}`, color: s.color, strong: true })),
    ]);
  };
  return (
    <div className="viz-fig" ref={ref}>
      {legend && series.length > 1 ? (
        <p className="viz-legend">
          {series.map((s) => (
            <span key={s.name}>
              <span className="viz-key" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </p>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R + 6} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-base' : 'viz-grid'} />
            <text x={L - 6} y={y(t) + 4} className="viz-axis" textAnchor="end">
              {Math.round(t).toLocaleString('zh-TW')}
            </text>
          </g>
        ))}
        {series.length === 1 && n > 1 ? (
          <path
            d={`M${x(0)},${B}` + series[0].points.map((p, i) => `L${x(i)},${y(p.value)}`).join('') + `L${x(n - 1)},${B}Z`}
            fill={series[0].color}
            opacity={0.1}
          />
        ) : null}
        {series.map((s) =>
          n > 1 ? (
            <path key={s.name} d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('')} className="viz-line" stroke={s.color} />
          ) : null,
        )}
        {at !== null ? <line x1={x(at)} x2={x(at)} y1={T} y2={B} className="viz-cross" /> : null}
        {series.map((s) => {
          const p = s.points[n - 1];
          if (!p) return null;
          // 線尾的數字靠太近會疊在一起：那就都不標，看圖例、提示和表格
          const crowded = series.some((o) => o !== s && o.points[n - 1] && Math.abs(y(o.points[n - 1].value) - y(p.value)) < 13);
          return (
            <g key={s.name}>
              <circle cx={x(n - 1)} cy={y(p.value)} r={4} fill={s.color} className="viz-dot" />
              {crowded ? null : (
                <text x={x(n - 1) + 9} y={y(p.value) + 4} className="viz-label">
                  {p.value.toLocaleString('zh-TW')}
                </text>
              )}
            </g>
          );
        })}
        {n ? (
          <>
            <text x={x(0)} y={H - 8} className="viz-axis" textAnchor={n > 1 ? 'start' : 'middle'}>
              {n > 1 ? md(series[0].points[0].date) : '今天'}
            </text>
            {n > 1 ? (
              <text x={x(n - 1)} y={H - 8} className="viz-axis" textAnchor="end">
                今天
              </text>
            ) : null}
          </>
        ) : null}
        <rect x={L} y={T} width={W - L - R} height={B - T} className="viz-hit" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={hide} />
      </svg>
      {box}
    </div>
  );
}

/* ---------------- 比例條（目前的熟悉度） ---------------- */

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function StackBar({ title, segments, note }: { title: ReactNode; segments: Segment[]; note?: string }) {
  const { ref, show, hide, box } = useTip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const desc = segments.map((s) => `${s.label} ${s.value}`).join('、');
  return (
    <div className="viz-fig stackbar" ref={ref}>
      <p className="stackbar-title">
        {title}
        {note ? <span className="small"> {note}</span> : null}
      </p>
      <div className="stackbar-bar" role="img" aria-label={`${desc}（共 ${total}）`} onPointerLeave={hide}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const onShow = (e: ReactPointerEvent) =>
              show(e, [{ text: `${s.value.toLocaleString('zh-TW')}（${Math.round((s.value / total) * 100)}%）`, strong: true }, { text: s.label, color: s.color }]);
            return <span key={s.label} style={{ flexGrow: s.value, background: s.color }} onPointerMove={onShow} onPointerDown={onShow} />;
          })}
      </div>
      {box}
    </div>
  );
}

/** 比例條共用的圖例 */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <p className="viz-legend">
      {items.map((s) => (
        <span key={s.label}>
          <span className="viz-key box" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </p>
  );
}
