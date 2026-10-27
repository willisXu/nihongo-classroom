/**
 * 筆順描字引擎（純函式，不碰 DOM，可在 Node 測試）。
 *
 * 資料：src/data/strokes.json，KanjiVG 的筆畫 path（109×109 座標，依書寫順序）。
 * 判定方式見下方「判定」一節：使用者的一筆與參考筆畫都依弧長重新取樣，
 * 逐點比對（有方向性），把誤差拆成「位置」與「形狀」分開用不同的容許值判斷，
 * 不合格時找出最可能的原因（太短、方向、筆順、位置、形狀）。
 */
import data from '../data/strokes.json';

export type Pt = { x: number; y: number };

export type StrokeFailReason = 'tooShort' | 'direction' | 'order' | 'shape' | 'position';

export type StrokeJudgement = {
  ok: boolean;
  /** 不合格的原因（ok 時沒有） */
  reason?: StrokeFailReason;
  /** ok 時是 expectedIndex；reason 為 'order' 時是使用者其實寫的那一筆 */
  matchedIndex?: number;
  /** 與「應該寫的那一筆」順向比對的平均距離（109 座標單位） */
  distance: number;
  /** ok 時：這一筆的重心 − 標準筆畫的重心。呼叫端把寫對的每一筆平均起來，當下一筆的 bias（見 judgeStroke） */
  shift?: Pt;
};

/** 字面座標系的邊長（KanjiVG viewBox 0 0 109 109） */
export const GLYPH_SIZE = 109;
/** 字面中心 */
export const GLYPH_CENTER: Pt = { x: GLYPH_SIZE / 2, y: GLYPH_SIZE / 2 };

const STROKES: Readonly<Record<string, readonly string[]>> = data.strokes;

/** 這個字有沒有筆順資料 */
export function hasStrokes(ch: string): boolean {
  return Object.hasOwn(STROKES, ch);
}

/**
 * 小字（ゃ ゅ ょ っ、ャ ュ ョ ッ、ァ ィ ゥ ェ ォ…）的範本位置。
 * KanjiVG 的小字是一般字的八成大、置中靠下；課文教的是寫成一半左右、橫寫時放在格子左下方，
 * 照課文寫會被判位置、形狀錯。所以把小字以左下角附近為中心縮小（約一般字的一半）。
 */
export const SMALL_KANA = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ']);
const SMALL_SCALE = 0.62;
const SMALL_ANCHOR: Pt = { x: 16, y: 96 };
/** KanjiVG 的小字本來就是一般字的八成大 */
const KANJIVG_SMALL = 0.8;

/**
 * 判定門檻的比例：小字縮到一般字的一半左右，「很小的筆畫（點一下也算）」「要看方向」這些用長度判斷的門檻也跟著縮，
 * 不然 ッ、ょ、ゥ 的每一筆都會被當成點，反方向寫、只點一下也算對。
 */
export function judgeScale(ch: string): number {
  return SMALL_KANA.has(ch) ? SMALL_SCALE * KANJIVG_SMALL : 1;
}

/** 把一筆 SVG path 縮小到小字的位置：大寫（絕對座標）縮放加平移，小寫（相對座標）只縮放 */
export function shrinkSmallStroke(d: string): string {
  return d.replace(/([A-Za-z])([^A-Za-z]*)/g, (_, cmd: string, args: string) => {
    if (/[HVAhva]/.test(cmd)) throw new Error(`小字的筆畫不支援 ${cmd} 指令`);
    const nums = (args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const abs = cmd === cmd.toUpperCase();
    const out = nums.map((v, i) => {
      if (!abs) return v * SMALL_SCALE;
      const o = i % 2 === 0 ? SMALL_ANCHOR.x : SMALL_ANCHOR.y;
      return o + (v - o) * SMALL_SCALE;
    });
    return cmd + out.map((v) => Number(v.toFixed(2))).join(',');
  });
}

const smallCache = new Map<string, readonly string[]>();
/** 這個字的筆畫（小字已經縮到左下方） */
function strokesOf(ch: string): readonly string[] {
  if (!SMALL_KANA.has(ch)) return STROKES[ch];
  let out = smallCache.get(ch);
  if (!out) {
    out = STROKES[ch].map(shrinkSmallStroke);
    smallCache.set(ch, out);
  }
  return out;
}

/** 取得一個字各筆畫的 SVG path（依書寫順序）；沒有資料時回傳 undefined */
export function getStrokePaths(ch: string): string[] | undefined {
  return hasStrokes(ch) ? [...strokesOf(ch)] : undefined;
}

/*
 * path → 折線：KanjiVG 的筆畫只用 M、C、c、S、s（另外支援 L、l）。三次貝茲曲線切成短直線，
 * 再沿折線等距取樣。以前用 svg-path-properties 的 getPointAtLength（每個點都要二分搜尋＋數值積分），
 * 筆畫多的漢字第一次顯示在手機上會卡一兩百毫秒；這樣快 20 倍以上，取樣點的差不到 0.1 單位。
 * 資料沒用到的指令（H、V、Q、T、A、Z）遇到就丟錯，不要默默畫錯。
 */
const PATH_ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, C: 6, S: 4 };
/** 每段曲線切成幾段直線（切 32 段，整筆的長度和真正的曲線差不到 0.1 單位） */
const CURVE_STEPS = 32;

/** 把一筆的 path 轉成折線（字面座標） */
function flattenPath(d: string): Pt[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: Pt[] = [];
  let cmd = '';
  let args: number[] = [];
  let x = 0;
  let y = 0;
  // 上一段曲線的第二個控制點：S、s 的第一個控制點是它對目前位置的鏡射
  let cx = 0;
  let cy = 0;
  let afterCurve = false;
  for (const t of tokens) {
    if (/[A-Za-z]/.test(t)) {
      if (!(t.toUpperCase() in PATH_ARITY)) throw new Error(`筆畫的 path 不支援 ${t} 指令：${d}`);
      if (args.length) throw new Error(`筆畫的 path 參數不完整：${d}`);
      cmd = t;
      continue;
    }
    const abs = cmd.toUpperCase();
    if (!cmd || (abs === 'M') !== (out.length === 0)) throw new Error(`筆畫的 path 要以 M 開頭，而且只能有一個 M：${d}`);
    args.push(Number(t));
    if (args.length < PATH_ARITY[abs]) continue;
    const ox = cmd === abs ? 0 : x;
    const oy = cmd === abs ? 0 : y;
    const a = args.map((v, i) => v + (i % 2 ? oy : ox));
    args = [];
    if (abs === 'M' || abs === 'L') {
      [x, y] = a;
      out.push({ x, y });
      afterCurve = false;
      // M 後面多的座標是 lineto
      if (abs === 'M') cmd = cmd === 'M' ? 'L' : 'l';
      continue;
    }
    const [x1, y1] = abs === 'C' ? a : afterCurve ? [2 * x - cx, 2 * y - cy] : [x, y];
    const [x2, y2, x3, y3] = abs === 'C' ? a.slice(2) : a;
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t1 = s / CURVE_STEPS;
      const t0 = 1 - t1;
      const k0 = t0 * t0 * t0;
      const k1 = 3 * t0 * t0 * t1;
      const k2 = 3 * t0 * t1 * t1;
      const k3 = t1 * t1 * t1;
      out.push({ x: k0 * x + k1 * x1 + k2 * x2 + k3 * x3, y: k0 * y + k1 * y1 + k2 * y2 + k3 * y3 });
    }
    cx = x2;
    cy = y2;
    x = x3;
    y = y3;
    afterCurve = true;
  }
  if (args.length) throw new Error(`筆畫的 path 參數不完整：${d}`);
  if (!out.length) throw new Error(`筆畫的 path 是空的：${d}`);
  return out;
}

/** SVG path 的總長度 */
export function pathLength(d: string): number {
  return polylineLength(flattenPath(d));
}

/** 取樣點數：取整數，非有限數或負數當作 0 */
function toCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** 沿著 SVG path 等距取 n 個點（含起點與終點）；只有一個點或長度是 0 時，回傳 n 個起點 */
export function samplePath(d: string, n = 48): Pt[] {
  return resample(flattenPath(d), n);
}

const pointCache = new Map<string, Pt[][]>();

/**
 * 一個字所有筆畫的取樣點（每筆 n 點）。結果會快取，
 * 同樣的 (ch, n) 會拿到同一個陣列，請不要修改它。
 */
export function getStrokePoints(ch: string, n = 48): Pt[][] | undefined {
  if (!hasStrokes(ch)) return undefined;
  const key = `${ch}\u0000${n}`;
  let pts = pointCache.get(key);
  if (!pts) {
    pts = strokesOf(ch).map((d) => samplePath(d, n));
    pointCache.set(key, pts);
  }
  return pts;
}

/** 折線總長 */
export function polylineLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/**
 * 沿折線等距重新取樣成 n 點（含起點與終點）。
 * 只有一個點或總長為 0 時，回傳 n 個同樣的點；沒有點時回傳空陣列。
 */
export function resample(points: readonly Pt[], n: number): Pt[] {
  const count = toCount(n);
  if (count === 0 || points.length === 0) return [];
  const first = points[0];
  const total = polylineLength(points);
  if (count === 1 || points.length === 1 || !(total > 0)) {
    return Array.from({ length: count }, () => ({ x: first.x, y: first.y }));
  }
  const out: Pt[] = [{ x: first.x, y: first.y }];
  let k = 1; // 下一個要放的點
  let walked = 0; // 走到 points[i - 1] 時累積的長度
  for (let i = 1; i < points.length && k < count - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (k < count - 1) {
      const target = (total * k) / (count - 1);
      if (target > walked + seg) break;
      const t = seg > 0 ? (target - walked) / seg : 0;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      k++;
    }
    walked += seg;
  }
  const last = points[points.length - 1];
  while (out.length < count) out.push({ x: last.x, y: last.y });
  return out;
}

/**
 * 螢幕座標 → 字面座標（0–109）。rect 是 SVG 內容區（viewBox 對應的範圍）；
 * 依 SVG 預設的 xMidYMid meet 處理非正方形的情況。
 */
export function toGlyphSpace(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Pt {
  const scale = Math.min(rect.width, rect.height) / GLYPH_SIZE;
  if (!(scale > 0)) return { x: 0, y: 0 };
  const left = rect.left + (rect.width - GLYPH_SIZE * scale) / 2;
  const top = rect.top + (rect.height - GLYPH_SIZE * scale) / 2;
  return { x: (clientX - left) / scale, y: (clientY - top) / scale };
}

/* ───────────────────────── 判定 ───────────────────────── */
/*
 * 兩筆都依弧長重新取樣成 JUDGE_POINTS 點，逐點比對，再把誤差拆成兩部分：
 *   位移：兩筆重心的距離。用寬鬆的絕對容許值（寫得稍大、稍小、偏一點都沒關係）。
 *   形狀：重心對齊後逐點的平均距離。容許值依筆畫長度調整（小筆畫有固定的下限），
 *         所以用直線代替「へ」的彎折、少了「る」最後的圈都不會過。
 * 逐點對應對「起筆晚一點、收筆早一點」很敏感，所以稍微超過容許值時，
 * 再用允許少量快慢差異的 DTW 比一次，吻合得夠好也算形狀正確。
 */

/** 比對時每一筆重新取樣的點數 */
export const JUDGE_POINTS = 32;
/** 使用者的一筆短於這個長度，視為只是點一下 */
export const TAP_LENGTH = 3;
/** 參考筆畫短於這個長度算「很小的筆畫」（濁音點等），點一下也算數 */
export const TINY_STROKE = 14;
/** 參考筆畫起訖點距離至少這麼遠，才要求方向正確（點、圈不計較方向） */
export const DIRECTION_SPAN = 14;
/**
 * 起訖點很近、但整筆夠長的筆畫也要求方向：像「教」第 5 筆 ㇖ 這種折回來的筆畫（長 33、起訖點只差 12），
 * 只看起訖點距離的話反方向寫也算對。短筆畫（點）照舊不計較方向。
 */
export const DIRECTION_LENGTH = 20;
/** 重心位移的容許值（絕對值，109 座標單位） */
export const POSITION_TOLERANCE = 12;

const SHAPE_MIN = 5;
const SHAPE_MAX = 11;
const SHAPE_BASE = 3.5;
const SHAPE_PER_LENGTH = 0.025;
/** 起訖點距離小於這個值，視為封閉的圈（半濁音圈）：不計較起點與方向 */
const CLOSED_SPAN = 5;
/** 使用者的一筆起訖點距離不到長度的這個比例，才算畫了一個圈 */
const USER_CLOSED_RATIO = 0.35;
/** 補救比對：逐點誤差在容許值的這個倍數以內… */
const RESCUE_MAX = 1.6;
/** …而且 DTW（允許前後錯開 DTW_BAND 點）誤差在容許值的這個倍數以內，也算形狀正確 */
const RESCUE_DTW = 0.6;
const DTW_BAND = 2;
/** 反向比順向好這麼多倍才算寫反 */
const REVERSE_RATIO = 0.6;
/** 判形狀不對時，長度不到參考筆畫的這個比例就改說「太短」 */
const SHORT_RATIO = 0.6;
/**
 * 判對的一筆，其實是先寫了後面相鄰的平行筆畫嗎？日、目、門、言、隹 裡相鄰的橫畫重心只差 10～12 單位，
 * 在位置容許值以內，不另外檢查的話，書、題、計 的橫畫對調著寫也全部判對。
 * 先扣掉這個人前面幾筆的整體偏移（字寫得偏一邊、大一點小一點），離後面那一筆不到兩筆間距的 ORDER_NEAR、
 * 離應該寫的這一筆超過 1 − ORDER_NEAR 才算筆順錯；中間的模糊地帶照舊當作寫對
 * （模擬縮放、旋轉、偏移、抖動照順序寫全部的字約 4 萬筆，只誤判 1 筆）。
 */
const ORDER_NEAR = 0.35;
/**
 * 只看重心相距這麼近的筆畫：以前會直接判對的對調，兩筆都在位置容許值以內（實測 8～12 單位）；
 * 再遠的照標準寫在那裡本來就判得出筆順錯。放寬的話，照順序寫的「町」「説」偶爾會被誤判。
 */
const ORDER_RANGE = POSITION_TOLERANCE;

/** 形狀誤差的容許值：小筆畫用固定的絕對下限，長筆畫放寬一些 */
export function shapeTolerance(ref: readonly Pt[]): number {
  const len = polylineLength(ref);
  return Math.min(SHAPE_MAX, Math.max(SHAPE_MIN, SHAPE_BASE + SHAPE_PER_LENGTH * len));
}

function centroid(points: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function centerOn(points: readonly Pt[], c: Pt): Pt[] {
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

/** 兩組等長的點逐點平均距離 */
function meanDistance(a: readonly Pt[], b: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return sum / a.length;
}

/**
 * 有帶狀限制的 DTW（symmetric2 步進權重），回傳正規化後的平均距離。
 * 只走對角線時就等於逐點平均距離；band 是允許前後錯開的點數。
 */
function dtw(a: readonly Pt[], b: readonly Pt[], band: number): number {
  const n = a.length;
  const m = b.length;
  const w = Math.max(band, Math.abs(n - m));
  let prev = new Float64Array(m).fill(Infinity);
  let cur = new Float64Array(m).fill(Infinity);
  for (let i = 0; i < n; i++) {
    cur.fill(Infinity);
    for (let j = Math.max(0, i - w); j <= Math.min(m - 1, i + w); j++) {
      const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
      if (i === 0 && j === 0) {
        cur[j] = 2 * d;
        continue;
      }
      let best = Infinity;
      if (i > 0 && j > 0) best = prev[j - 1] + 2 * d;
      if (i > 0) best = Math.min(best, prev[j] + d);
      if (j > 0) best = Math.min(best, cur[j - 1] + d);
      cur[j] = best;
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m - 1] / (n + m);
}

/** 兩組點的對稱平均最近點距離（不看順序），用在封閉的圈 */
function chamfer(a: readonly Pt[], b: readonly Pt[]): number {
  const half = (p: readonly Pt[], q: readonly Pt[]) => {
    let sum = 0;
    for (const s of p) {
      let best = Infinity;
      for (const t of q) best = Math.min(best, Math.hypot(s.x - t.x, s.y - t.y));
      sum += best;
    }
    return sum / p.length;
  };
  return (half(a, b) + half(b, a)) / 2;
}

/** 一筆參考筆畫的比對資料 */
type RefInfo = {
  /** 算門檻用的比例（見 judgeScale） */
  scale: number;
  pts: Pt[];
  c: Pt;
  /** 以重心為原點的點（順向、反向） */
  centered: Pt[];
  centeredRev: Pt[];
  length: number;
  /** 封閉的圈：不計較起點與方向 */
  closed: boolean;
  /** 要求方向正確 */
  directional: boolean;
  shapeTol: number;
};

const refInfoCache = new WeakMap<readonly Pt[], RefInfo>();

function refInfo(stroke: readonly Pt[], scale = 1): RefInfo {
  const cached = refInfoCache.get(stroke);
  if (cached && cached.scale === scale) return cached;
  const pts = resample(stroke, JUDGE_POINTS);
  const length = polylineLength(stroke);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const span = Math.hypot(first.x - last.x, first.y - last.y);
  const closed = length >= TINY_STROKE * scale && span < CLOSED_SPAN * scale;
  const c = centroid(pts);
  const centered = centerOn(pts, c);
  const info: RefInfo = {
    scale,
    pts,
    c,
    centered,
    centeredRev: [...centered].reverse(),
    length,
    closed,
    directional: !closed && (span >= DIRECTION_SPAN * scale || length >= DIRECTION_LENGTH * scale),
    shapeTol: shapeTolerance(stroke),
  };
  refInfoCache.set(stroke, info);
  return info;
}

type Match = {
  /** 逐點平均距離（順向、未對齊） */
  dFwd: number;
  /** 重心位移 */
  offset: number;
  /** 重心對齊後的逐點平均距離：順向、反向 */
  shapeFwd: number;
  shapeRev: number;
  /** 形狀吻合度（除以容許值，≤ 1 算吻合）：順向、反向、實際採用的值 */
  fitFwd: number;
  fitRev: number;
  fit: number;
};

/** 形狀吻合度：逐點誤差 ÷ 容許值；稍微超過時用 DTW 補救 */
function shapeFit(u: readonly Pt[], r: readonly Pt[], mean: number, tol: number): number {
  const fit = mean / tol;
  if (fit <= 1 || fit > RESCUE_MAX) return fit;
  return Math.min(fit, dtw(u, r, DTW_BAND) / (RESCUE_DTW * tol));
}

function matchStroke(u: readonly Pt[], cu: Pt, r: RefInfo): Match {
  const uc = centerOn(u, cu);
  const shapeFwd = meanDistance(uc, r.centered);
  const shapeRev = meanDistance(uc, r.centeredRev);
  const fitFwd = shapeFit(uc, r.centered, shapeFwd, r.shapeTol);
  const fitRev = shapeFit(uc, r.centeredRev, shapeRev, r.shapeTol);
  let fit = r.directional ? fitFwd : Math.min(fitFwd, fitRev);
  if (r.closed) {
    // 圈可以從任何地方起筆、往任一方向畫，但使用者的一筆本身也要是個圈
    const n = u.length;
    const userSpan = Math.hypot(u[0].x - u[n - 1].x, u[0].y - u[n - 1].y);
    if (userSpan <= USER_CLOSED_RATIO * polylineLength(u)) fit = Math.min(fit, chamfer(uc, r.centered) / r.shapeTol);
  }
  return {
    dFwd: meanDistance(u, r.pts),
    offset: Math.hypot(cu.x - r.c.x, cu.y - r.c.y),
    shapeFwd,
    shapeRev,
    fitFwd,
    fitRev,
    fit,
  };
}

/** 方向寫反了：反向的形狀吻合，而且明顯比順向吻合 */
function isReversed(m: Match, r: RefInfo): boolean {
  return r.directional && m.fitRev <= 1 && m.shapeRev < REVERSE_RATIO * m.shapeFwd;
}

/**
 * 形狀、方向都像第 k 筆的這一筆，扣掉整體偏移 bias 之後其實落在後面哪一筆上（見 ORDER_NEAR）；沒有就是 undefined。
 * 點（濁音點、雨的四點）先寫哪一點都算，不檢查。
 */
function laterStrokeHere(
  u: readonly Pt[],
  cu: Pt,
  k: number,
  ref: readonly (readonly Pt[])[],
  scale: number,
  bias: Pt,
): number | undefined {
  const exp = refInfo(ref[k], scale);
  if (exp.length < TINY_STROKE * scale) return undefined;
  const x = cu.x - bias.x;
  const y = cu.y - bias.y;
  const offK = Math.hypot(x - exp.c.x, y - exp.c.y);
  let found: number | undefined;
  let nearest = ORDER_NEAR;
  for (let j = k + 1; j < ref.length; j++) {
    const rj = refInfo(ref[j], scale);
    const sep = Math.hypot(rj.c.x - exp.c.x, rj.c.y - exp.c.y);
    if (rj.length < TINY_STROKE * scale || !(sep > 0) || sep > ORDER_RANGE || offK <= (1 - ORDER_NEAR) * sep) continue;
    const near = Math.hypot(x - rj.c.x, y - rj.c.y) / sep;
    if (near >= nearest) continue;
    const mj = matchStroke(u, cu, rj);
    if (mj.fit > 1 || isReversed(mj, rj)) continue;
    found = j;
    nearest = near;
  }
  return found;
}

/** 整體吻合度（形狀與位移取較差的一個，≤ 1 算吻合） */
function overallFit(m: Match): number {
  return Math.max(m.fit, m.offset / POSITION_TOLERANCE);
}

type Candidate = { reason: StrokeFailReason; score: number; matchedIndex?: number };

const REASON_RANK: Record<StrokeFailReason, number> = { order: 0, direction: 1, position: 2, shape: 3, tooShort: 4 };

/**
 * 判定使用者寫的一筆是否就是第 expectedIndex 筆（從 0 起算）。
 * user 是字面座標的折線；ref 是 getStrokePoints() 的結果。
 *
 * 合格：重心位移 ≤ POSITION_TOLERANCE、形狀吻合，（需要方向的筆畫）不是反向寫的，
 * 而且扣掉這個人整體的偏移（bias）之後，不是落在後面相鄰的平行筆畫上（那是筆順錯）。
 * 不合格時從幾種解釋裡挑最吻合的一種：
 *   direction 反向的形狀吻合 · order 吻合後面還沒寫的某一筆 · position 形狀吻合但位置偏了；
 *   都不是就是 shape（明顯太短時改為 tooShort）。
 */
export function judgeStroke(
  user: readonly Pt[],
  expectedIndex: number,
  ref: readonly (readonly Pt[])[],
  /** 小字用 judgeScale(字) 的比例縮小門檻 */
  scale = 1,
  /** 這個人前面寫對的幾筆的整體偏移（每一筆 shift 的平均）：判筆順時先扣掉。還沒寫對任何一筆時是 0 */
  bias: Pt = { x: 0, y: 0 },
): StrokeJudgement {
  if (!Number.isInteger(expectedIndex) || expectedIndex < 0 || expectedIndex >= ref.length) {
    throw new RangeError(`expectedIndex ${expectedIndex} 超出範圍（共 ${ref.length} 筆）`);
  }
  if (user.length === 0) return { ok: false, reason: 'tooShort', distance: Infinity };

  const k = expectedIndex;
  const exp = refInfo(ref[k], scale);
  const u = resample(user, JUDGE_POINTS);
  const cu = centroid(u);
  const userLen = polylineLength(user);
  const m = matchStroke(u, cu, exp);
  const distance = m.dFwd;

  // 只是點一下：除非這一筆本來就是很小的點（濁音點），否則請使用者寫完整
  if (userLen < TAP_LENGTH && exp.length >= TINY_STROKE * scale) {
    return { ok: false, reason: 'tooShort', distance };
  }

  const shapeOk = m.fit <= 1;
  const posOk = m.offset <= POSITION_TOLERANCE;
  const reversed = isReversed(m, exp);
  // 形狀、方向都對，但扣掉整體偏移之後落在後面相鄰的筆畫上：是先寫了那一筆（不要說成寫對或位置偏了）
  const later = shapeOk && !reversed ? laterStrokeHere(u, cu, k, ref, scale, bias) : undefined;
  if (later !== undefined) return { ok: false, reason: 'order', matchedIndex: later, distance };
  if (shapeOk && posOk && !reversed) return { ok: true, matchedIndex: k, distance, shift: { x: cu.x - exp.c.x, y: cu.y - exp.c.y } };

  const candidates: Candidate[] = [];
  if (reversed) candidates.push({ reason: 'direction', score: m.fitRev });
  if (shapeOk && !posOk && !reversed) candidates.push({ reason: 'position', score: m.fit });

  // 後面還沒寫的筆畫裡，整筆吻合而且比這一筆更像的
  const expectedFit = overallFit(m);
  for (let j = k + 1; j < ref.length; j++) {
    const rj = refInfo(ref[j], scale);
    const mj = matchStroke(u, cu, rj);
    const fj = overallFit(mj);
    if (fj <= 1 && fj < expectedFit && !isReversed(mj, rj)) {
      candidates.push({ reason: 'order', score: fj, matchedIndex: j });
    }
  }

  if (candidates.length > 0) {
    // 挑最吻合的解釋；分數相同時筆順優先（完全吻合另一筆是最強的證據）
    candidates.sort((a, b) => a.score - b.score || REASON_RANK[a.reason] - REASON_RANK[b.reason]);
    const best = candidates[0];
    return best.matchedIndex === undefined
      ? { ok: false, reason: best.reason, distance }
      : { ok: false, reason: best.reason, matchedIndex: best.matchedIndex, distance };
  }

  if (userLen < SHORT_RATIO * exp.length) return { ok: false, reason: 'tooShort', distance };
  return { ok: false, reason: 'shape', distance };
}
