/**
 * 筆順描字練習格（原稿紙的一格）。
 *
 * trace：淡淡的字當底，照著描。recall：空白格，憑記憶寫；同一筆錯一次會出現起筆圓點，
 * 錯兩次會自動示範這一筆，並留下這一筆的淡色提示。
 * 每寫完一筆就用 judgeStroke 判定：對了吸附成標準筆畫（墨色），
 * 錯了紅線淡出，格子下方用一句話說明原因。
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  GLYPH_SIZE,
  TAP_LENGTH,
  getStrokePaths,
  getStrokePoints,
  judgeStroke,
  pathLength,
  polylineLength,
  toGlyphSpace,
} from '../lib/strokes';
import type { Pt, StrokeJudgement } from '../lib/strokes';
import './TraceCanvas.css';

export type TraceMode = 'trace' | 'recall';

export type TraceResult = { char: string; mistakes: number; strokes: number };

export type TraceCanvasProps = {
  char: string;
  mode: TraceMode;
  /** 全部筆畫寫完時呼叫一次；mistakes 是寫錯的次數（只是點一下不算） */
  onComplete?: (r: TraceResult) => void;
  /** 每寫完一筆（不論對錯）呼叫，index 是應該寫的那一筆（從 0 起算） */
  onStroke?: (j: StrokeJudgement, index: number) => void;
  /** 改變時播放整個字的筆順示範 */
  demoKey?: number;
  /** 改變時清除進度，從第一筆重新開始 */
  resetKey?: number;
  /** 格子最大寬度（CSS px），預設 320 */
  size?: number;
};

const DEMO_STROKE_MS = 500;
const DEMO_GAP_MS = 160;
const DEMO_HOLD_MS = 450;
const REDUCED_DEMO_MS = 1500;
const FAIL_FADE_MS = 600;
/** 連續兩點小於這個距離（字面單位）就不記錄 */
const MIN_POINT_GAP = 0.3;
const MID = GLYPH_SIZE / 2;

type Insets = { left: number; top: number; right: number; bottom: number };
type Drawing = { pointerId: number; points: Pt[]; insets: Insets };
type Demo = { id: number; strokes: number[]; full: boolean; reduced: boolean };
type FailLine = { id: number; points: string };
type Message = { id: number; text: string; tone: 'mark' | 'ok' };

function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** 邊框與內距：viewBox 對應的是內容區，不是整個元素 */
function readInsets(el: Element): Insets {
  const cs = getComputedStyle(el);
  const px = (v: string) => Number.parseFloat(v) || 0;
  return {
    left: px(cs.borderLeftWidth) + px(cs.paddingLeft),
    top: px(cs.borderTopWidth) + px(cs.paddingTop),
    right: px(cs.borderRightWidth) + px(cs.paddingRight),
    bottom: px(cs.borderBottomWidth) + px(cs.paddingBottom),
  };
}

function contentRect(el: Element, i: Insets) {
  const r = el.getBoundingClientRect();
  return { left: r.left + i.left, top: r.top + i.top, width: r.width - i.left - i.right, height: r.height - i.top - i.bottom };
}

function addPoint(d: Drawing, p: Pt): void {
  const last = d.points[d.points.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_GAP) return;
  d.points.push(p);
}

/** polyline 的 points 屬性；只有一點時重複一次，讓圓頭筆觸畫出一個點 */
function pointsAttr(points: readonly Pt[]): string {
  const list = points.length === 1 ? [points[0], points[0]] : points;
  return list.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function strokeMessage(j: StrokeJudgement, index: number): string {
  switch (j.reason) {
    case 'tooShort':
      return '太短了，按住拖曳，寫出完整的一筆';
    case 'direction':
      return '方向反了，從圓點開始寫';
    case 'order':
      return `這是第 ${(j.matchedIndex ?? index) + 1} 筆的形狀，現在要寫第 ${index + 1} 筆`;
    case 'position':
      return '形狀對了，位置再對準一點';
    default:
      return '形狀不太對，看一下示範再試一次';
  }
}

export function TraceCanvas({ char, mode, onComplete, onStroke, demoKey, resetKey, size = 320 }: TraceCanvasProps) {
  const paths = useMemo(() => getStrokePaths(char) ?? [], [char]);
  /** 標準筆畫的取樣點（判定用） */
  const model = useMemo(() => getStrokePoints(char) ?? [], [char]);
  const lengths = useMemo(() => paths.map((d) => pathLength(d)), [paths]);
  const total = paths.length;

  const [done, setDone] = useState(0);
  const [tries, setTries] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [fails, setFails] = useState<FailLine[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);

  // 換字、換模式或 resetKey 改變就從頭開始（在 render 裡調整，不會先閃一下舊進度）
  const session = `${char}\u0000${mode}\u0000${resetKey ?? ''}`;
  const [seenSession, setSeenSession] = useState(session);
  if (seenSession !== session) {
    setSeenSession(session);
    setDone(0);
    setTries(0);
    setMistakes(0);
    setFails([]);
    setMessage(null);
    setDemo(null);
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPolylineElement>(null);
  const drawingRef = useRef<Drawing | null>(null);
  const frameRef = useRef(0);
  const timersRef = useRef<Set<number>>(new Set());
  const demoTimerRef = useRef(0);
  const seqRef = useRef(0);
  const helpId = useId();
  const statusId = useId();

  const complete = total > 0 && done >= total;
  const busy = demo !== null;
  const canDraw = total > 0 && !complete && !busy;

  const later = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  };

  const clearLive = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    liveRef.current?.setAttribute('points', '');
  };

  const cancelDrawing = () => {
    const d = drawingRef.current;
    drawingRef.current = null;
    const svg = svgRef.current;
    if (d && svg?.hasPointerCapture(d.pointerId)) svg.releasePointerCapture(d.pointerId);
    clearLive();
  };

  const scheduleLive = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const d = drawingRef.current;
      liveRef.current?.setAttribute('points', d ? pointsAttr(d.points) : '');
    });
  };

  const startDemo = (strokes: number[], full: boolean) => {
    if (strokes.length === 0) return;
    cancelDrawing();
    const reduced = prefersReducedMotion();
    const id = ++seqRef.current;
    setDemo({ id, strokes, full, reduced });
    const ms = reduced
      ? REDUCED_DEMO_MS
      : strokes.length * DEMO_STROKE_MS + (strokes.length - 1) * DEMO_GAP_MS + DEMO_HOLD_MS;
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      timersRef.current.delete(demoTimerRef.current);
    }
    demoTimerRef.current = later(() => {
      demoTimerRef.current = 0;
      setDemo((cur) => (cur?.id === id ? null : cur));
    }, ms);
  };

  const playFullDemo = () => startDemo(Array.from({ length: total }, (_, i) => i), true);

  // 換字、換模式、重來或卸載時：停掉計時器與進行中的筆畫
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      demoTimerRef.current = 0;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      drawingRef.current = null;
      liveRef.current?.setAttribute('points', '');
    };
  }, [session]);

  // demoKey 改變（第一次掛載不算）就播放整個字的示範
  const onDemoKey = useEffectEvent(playFullDemo);
  const demoKeySeen = useRef(demoKey);
  useEffect(() => {
    if (demoKeySeen.current === demoKey) return;
    demoKeySeen.current = demoKey;
    onDemoKey();
  }, [demoKey]);

  const finishStroke = (points: Pt[]) => {
    const index = done;
    if (index >= total) return;
    const j = judgeStroke(points, index, model);
    onStroke?.(j, index);
    const id = ++seqRef.current;
    if (j.ok) {
      const next = index + 1;
      setDone(next);
      setTries(0);
      if (next >= total) {
        setMessage({ id, text: '完成！', tone: 'ok' });
        onComplete?.({ char, mistakes, strokes: total });
      } else {
        setMessage(null);
      }
      return;
    }
    setFails((list) => [...list, { id, points: pointsAttr(points) }]);
    later(() => setFails((list) => list.filter((f) => f.id !== id)), FAIL_FADE_MS + 50);
    setMessage({ id, text: strokeMessage(j, index), tone: 'mark' });
    if (polylineLength(points) < TAP_LENGTH) return; // 只是點一下：提示但不算錯
    const failed = tries + 1;
    setTries(failed);
    setMistakes((m) => m + 1);
    if (failed % 2 === 0) startDemo([index], false);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!canDraw || drawingRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const svg = e.currentTarget;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // 指標已經離開（例如瞬間抬起），照樣記錄這一點
    }
    const insets = readInsets(svg);
    drawingRef.current = {
      pointerId: e.pointerId,
      points: [toGlyphSpace(e.clientX, e.clientY, contentRect(svg, insets))],
      insets,
    };
    scheduleLive();
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drawingRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = contentRect(e.currentTarget, d.insets);
    const native = e.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const ev of coalesced.length > 0 ? coalesced : [native]) addPoint(d, toGlyphSpace(ev.clientX, ev.clientY, rect));
    scheduleLive();
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drawingRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    addPoint(d, toGlyphSpace(e.clientX, e.clientY, contentRect(e.currentTarget, d.insets)));
    drawingRef.current = null;
    clearLive();
    finishStroke(d.points);
  };

  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drawingRef.current?.pointerId === e.pointerId) cancelDrawing();
  };

  const onLostPointerCapture = (e: ReactPointerEvent<SVGSVGElement>) => {
    // 只處理格子本身失去捕捉（pointerup 之後的釋放在那之前已經處理完）
    if (e.target === e.currentTarget && drawingRef.current?.pointerId === e.pointerId) cancelDrawing();
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) playFullDemo();
  };

  const showMarker = canDraw && (mode === 'trace' || tries > 0);
  const showHint = mode === 'recall' && tries >= 2 && !complete;
  const start = showMarker ? model[done]?.[0] : undefined;
  const label = total > 0 ? `${char} 的筆順練習，共 ${total} 筆` : `${char}：沒有筆順資料`;

  return (
    <div className={cls('trace', busy && 'trace--busy', complete && 'trace--done')} style={{ maxWidth: size }}>
      <svg
        ref={svgRef}
        className="trace-svg"
        viewBox={`0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`}
        role="img"
        aria-label={label}
        aria-describedby={`${helpId} ${statusId}`}
        tabIndex={total > 0 ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        onKeyDown={onKeyDown}
      >
        <g className="trace-cross">
          <line x1={MID} y1={0} x2={MID} y2={GLYPH_SIZE} />
          <line x1={0} y1={MID} x2={GLYPH_SIZE} y2={MID} />
        </g>
        {mode === 'trace' && (
          <g className="trace-ghost">
            {paths.map((d, i) => (
              <path key={i} className="trace-stroke" d={d} />
            ))}
          </g>
        )}
        {showHint && <path className="trace-stroke trace-hint" d={paths[done]} />}
        <g className={cls('trace-ink', demo?.full && 'trace-ink--hidden')}>
          {paths.slice(0, done).map((d, i) => (
            <path key={i} className="trace-stroke" d={d} />
          ))}
        </g>
        {demo && (
          <g className="trace-demo" key={demo.id}>
            {demo.strokes.map((i, order) => (
              <path
                key={i}
                className={cls('trace-stroke', demo.reduced && 'trace-stroke--static')}
                d={paths[i]}
                style={
                  demo.reduced
                    ? undefined
                    : {
                        strokeDasharray: `${lengths[i] + 2} ${lengths[i] + 14}`,
                        strokeDashoffset: lengths[i] + 8,
                        animationDuration: `${DEMO_STROKE_MS}ms`,
                        animationDelay: `${order * (DEMO_STROKE_MS + DEMO_GAP_MS)}ms`,
                      }
                }
              />
            ))}
          </g>
        )}
        {start && (
          <g className="trace-start" transform={`translate(${start.x.toFixed(2)} ${start.y.toFixed(2)})`}>
            <g className="trace-start-pop" key={done}>
              <circle r={4.4} />
              <text dy="0.36em" textAnchor="middle">
                {done + 1}
              </text>
            </g>
          </g>
        )}
        {fails.map((f) => (
          <polyline key={f.id} className="trace-fail" points={f.points} />
        ))}
        <polyline ref={liveRef} className="trace-live" />
      </svg>
      <p id={helpId} className="trace-sr">
        在格子裡依筆順書寫，滑鼠、觸控筆或手指都可以。按 Enter 或空白鍵播放筆順示範。
      </p>
      <div id={statusId} className="trace-status" aria-live="polite">
        {message && (
          <span key={message.id} className={cls('trace-msg', `trace-msg--${message.tone}`)}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default TraceCanvas;
