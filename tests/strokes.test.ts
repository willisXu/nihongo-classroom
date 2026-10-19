import { describe, expect, it } from 'vitest';
import data from '../src/data/strokes.json';
import {
  GLYPH_CENTER,
  GLYPH_SIZE,
  getStrokePaths,
  getStrokePoints,
  hasStrokes,
  judgeScale,
  judgeStroke,
  pathLength,
  polylineLength,
  resample,
  samplePath,
  shrinkSmallStroke,
  SMALL_KANA,
  toGlyphSpace,
  type Pt,
  type StrokeJudgement,
} from '../src/lib/strokes';

/* ───────── 測試工具 ───────── */

/** 可重現的亂數（mulberry32） */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHARS = Object.keys(data.strokes);

function refOf(ch: string): Pt[][] {
  const r = getStrokePoints(ch);
  if (!r) throw new Error(`no stroke data for ${ch}`);
  return r;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const span = (s: readonly Pt[]) => dist(s[0], s[s.length - 1]);
const jitter = (s: readonly Pt[], amp: number, rnd: () => number) =>
  s.map((p) => ({ x: p.x + (rnd() * 2 - 1) * amp, y: p.y + (rnd() * 2 - 1) * amp }));
const scaleAbout = (s: readonly Pt[], f: number, c: Pt = GLYPH_CENTER) =>
  s.map((p) => ({ x: c.x + f * (p.x - c.x), y: c.y + f * (p.y - c.y) }));
const translate = (s: readonly Pt[], dx: number, dy: number) => s.map((p) => ({ x: p.x + dx, y: p.y + dy }));
const reversed = (s: readonly Pt[]) => [...s].reverse();
const centroid = (s: readonly Pt[]) => ({
  x: s.reduce((t, p) => t + p.x, 0) / s.length,
  y: s.reduce((t, p) => t + p.y, 0) / s.length,
});
/** 兩筆（各自重新取樣後）的逐點平均距離，用來判斷兩筆是否「明顯不同」 */
const separation = (a: readonly Pt[], b: readonly Pt[]) => {
  const ra = resample(a, 32);
  const rb = resample(b, 32);
  return ra.reduce((t, p, i) => t + dist(p, rb[i]), 0) / ra.length;
};
const describeJ = (j: StrokeJudgement) =>
  (j.ok ? 'ok' : j.reason) + (j.matchedIndex === undefined ? '' : `@${j.matchedIndex + 1}`) + ` d=${j.distance.toFixed(1)}`;

/** 對每個字的每一筆執行 check，收集不符合的情況（失敗時一次列出全部） */
function everyStroke(check: (ch: string, k: number, ref: Pt[][]) => string | null): string[] {
  const failures: string[] = [];
  for (const ch of CHARS) {
    const ref = refOf(ch);
    for (let k = 0; k < ref.length; k++) {
      const msg = check(ch, k, ref);
      if (msg) failures.push(`${ch}#${k + 1}: ${msg}`);
    }
  }
  return failures;
}

/** 依序用 src 的每一筆去寫 target，是否每一筆都被接受 */
function acceptedAs(target: string, src: string): boolean {
  const t = refOf(target);
  const s = refOf(src);
  return t.length === s.length && s.every((stroke, k) => judgeStroke(stroke, k, t).ok);
}

/* ───────── 資料 ───────── */

describe('stroke data', () => {
  it('has all 169 kana in the 109×109 KanjiVG space', () => {
    expect(data._viewBox).toBe('0 0 109 109');
    expect(CHARS).toHaveLength(169);
    for (const ch of ['あ', 'ぁ', 'が', 'ぱ', 'ゔ', 'ア', 'ァ', 'ガ', 'パ', 'ヴ', 'ン', 'ー']) expect(hasStrokes(ch)).toBe(true);
  });

  it('returns stroke paths in drawing order', () => {
    const counts: Record<string, number> = { あ: 3, き: 4, さ: 3, シ: 3, ツ: 3, ソ: 2, ン: 2, が: 5, ぱ: 4, ー: 1 };
    for (const [ch, n] of Object.entries(counts)) expect(getStrokePaths(ch)).toHaveLength(n);
    for (const ch of CHARS) {
      const paths = getStrokePaths(ch);
      expect(paths?.length).toBeGreaterThan(0);
      for (const d of paths ?? []) expect(d).toMatch(/^[Mm]/);
    }
  });

  it('returns undefined for unknown characters, including prototype keys', () => {
    expect(getStrokePaths('漢')).toBeUndefined();
    expect(getStrokePaths('constructor')).toBeUndefined();
    expect(getStrokePoints('toString')).toBeUndefined();
    expect(hasStrokes('')).toBe(false);
  });

  it('returns a copy of the paths, so callers cannot change the data', () => {
    const a = getStrokePaths('あ');
    a?.push('M0,0');
    expect(getStrokePaths('あ')).toHaveLength(3);
  });
});

/* ───────── 取樣 ───────── */

describe('samplePath', () => {
  it('samples equidistant points including both ends', () => {
    const pts = samplePath('M0,0 L100,0', 11);
    expect(pts).toHaveLength(11);
    pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(i * 10, 6);
      expect(p.y).toBeCloseTo(0, 6);
    });
  });

  it('defaults to 48 points and follows curves', () => {
    const d = getStrokePaths('あ')?.[2] ?? '';
    const pts = samplePath(d);
    expect(pts).toHaveLength(48);
    expect(pts[0].x).toBeCloseTo(65.63, 2);
    expect(pts[0].y).toBeCloseTo(44.12, 2);
    const gaps = pts.slice(1).map((p, i) => dist(p, pts[i]));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - mean)).toBeLessThan(0.15 * mean); // 曲線上的弦長接近等距
    expect(polylineLength(pts)).toBeGreaterThan(0.98 * pathLength(d));
    expect(polylineLength(pts)).toBeLessThanOrEqual(pathLength(d) + 1e-6);
  });

  it('handles n = 1, n = 0 and degenerate paths', () => {
    expect(samplePath('M5,6 L50,60', 1)).toEqual([{ x: 5, y: 6 }]);
    expect(samplePath('M5,6 L50,60', 0)).toEqual([]);
    expect(samplePath('M5,6', 3)).toEqual([
      { x: 5, y: 6 },
      { x: 5, y: 6 },
      { x: 5, y: 6 },
    ]);
  });
});

describe('getStrokePoints', () => {
  it('is memoized per character and sample count', () => {
    const a = getStrokePoints('ぬ');
    expect(getStrokePoints('ぬ')).toBe(a);
    const b = getStrokePoints('ぬ', 16);
    expect(b).not.toBe(a);
    expect(b?.[0]).toHaveLength(16);
    expect(a).toHaveLength(2);
    expect(a?.[1]).toHaveLength(48);
  });
});

describe('resample', () => {
  it('places points equidistantly along a polyline and keeps both ends', () => {
    const l: Pt[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
    ];
    const r = resample(l, 7);
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual({ x: 0, y: 0 });
    expect(r[6]).toEqual({ x: 30, y: 30 });
    expect(r[3].x).toBeCloseTo(30, 9);
    expect(r[3].y).toBeCloseTo(0, 9);
    expect(r[2]).toEqual({ x: 20, y: 0 });
    expect(r[5].y).toBeCloseTo(20, 9);
  });

  it('copes with uneven input spacing and duplicate points', () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 90, y: 0 },
      { x: 90, y: 0 },
      { x: 100, y: 0 },
    ];
    const r = resample(pts, 5);
    expect(r.map((p) => Math.round(p.x * 1e6) / 1e6)).toEqual([0, 25, 50, 75, 100]);
  });

  it('handles a single point, zero length, empty input and tiny n', () => {
    expect(resample([{ x: 3, y: 4 }], 3)).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 4 },
    ]);
    expect(
      resample(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        2,
      ),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(resample([], 5)).toEqual([]);
    expect(resample([{ x: 1, y: 2 }, { x: 5, y: 2 }], 0)).toEqual([]);
    expect(resample([{ x: 1, y: 2 }, { x: 5, y: 2 }], 1)).toEqual([{ x: 1, y: 2 }]);
  });

  it('does not modify its input', () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const copy = structuredClone(pts);
    resample(pts, 9);
    expect(pts).toEqual(copy);
  });
});

describe('polylineLength', () => {
  it('sums segment lengths', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBeCloseTo(11, 9);
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([{ x: 1, y: 1 }])).toBe(0);
  });
});

describe('toGlyphSpace', () => {
  it('maps a square element onto the 109 viewBox', () => {
    const rect = { left: 100, top: 50, width: 218, height: 218 };
    expect(toGlyphSpace(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(toGlyphSpace(318, 268, rect)).toEqual({ x: GLYPH_SIZE, y: GLYPH_SIZE });
    expect(toGlyphSpace(209, 159, rect)).toEqual({ x: 54.5, y: 54.5 });
    expect(toGlyphSpace(90, 40, rect)).toEqual({ x: -5, y: -5 }); // 拖出格子外也照算
  });

  it('follows xMidYMid meet letterboxing for non-square rects', () => {
    const rect = { left: 0, top: 0, width: 318, height: 218 }; // 內容 218×218，左右各留 50
    expect(toGlyphSpace(50, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(toGlyphSpace(268, 218, rect)).toEqual({ x: GLYPH_SIZE, y: GLYPH_SIZE });
  });

  it('never returns NaN for an empty rect', () => {
    const p = toGlyphSpace(10, 10, { left: 0, top: 0, width: 0, height: 0 });
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

/* ───────── 判定：每個字的每一筆 ───────── */

describe('judgeStroke on every character', () => {
  it('accepts every reference stroke', () => {
    const failures = everyStroke((_ch, k, ref) => {
      const j = judgeStroke(ref[k], k, ref);
      return j.ok && j.matchedIndex === k && j.distance < 0.5 ? null : describeJ(j);
    });
    expect(failures).toEqual([]);
  });

  it('accepts ±3-unit random jitter', () => {
    const rnd = prng(20261012);
    const failures = everyStroke((_ch, k, ref) => {
      for (let rep = 0; rep < 4; rep++) {
        const j = judgeStroke(jitter(ref[k], 3, rnd), k, ref);
        if (!j.ok) return describeJ(j);
      }
      return null;
    });
    expect(failures).toEqual([]);
  });

  it('accepts strokes scaled 0.85× about the glyph centre', () => {
    const failures = everyStroke((_ch, k, ref) => {
      const j = judgeStroke(scaleAbout(ref[k], 0.85), k, ref);
      return j.ok ? null : describeJ(j);
    });
    expect(failures).toEqual([]);
  });

  it('accepts a coarse 12-point noisy version', () => {
    const rnd = prng(7);
    const failures = everyStroke((_ch, k, ref) => {
      for (let rep = 0; rep < 4; rep++) {
        const j = judgeStroke(jitter(resample(ref[k], 12), 2, rnd), k, ref);
        if (!j.ok) return describeJ(j);
      }
      return null;
    });
    expect(failures).toEqual([]);
  });

  it("rejects reversed strokes whose ends are more than 15 units apart with 'direction'", () => {
    let checked = 0;
    const failures = everyStroke((_ch, k, ref) => {
      if (span(ref[k]) <= 15) return null;
      checked++;
      const j = judgeStroke(reversed(ref[k]), k, ref);
      return !j.ok && j.reason === 'direction' ? null : describeJ(j);
    });
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(300);
  });

  it("rejects strokes moved 30 units away with 'position'", () => {
    const failures = everyStroke((_ch, k, ref) => {
      for (let a = 0; a < 8; a++) {
        const angle = (a * Math.PI) / 4;
        const j = judgeStroke(translate(ref[k], 30 * Math.cos(angle), 30 * Math.sin(angle)), k, ref);
        if (j.ok || j.reason !== 'position') return `${a * 45}°: ${describeJ(j)}`;
      }
      return null;
    });
    expect(failures).toEqual([]);
  });

  it("rejects writing the next stroke first with 'order' when the two strokes clearly differ", () => {
    let checked = 0;
    const failures = everyStroke((_ch, k, ref) => {
      if (k + 1 >= ref.length || separation(ref[k + 1], ref[k]) < 16) return null;
      checked++;
      const j = judgeStroke(ref[k + 1], k, ref);
      return !j.ok && j.reason === 'order' && j.matchedIndex === k + 1 ? null : describeJ(j);
    });
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(250);
  });

  it("rejects a tap with 'tooShort' unless the stroke itself is a tiny dot", () => {
    const failures = everyStroke((_ch, k, ref) => {
      if (polylineLength(ref[k]) < 14) return null;
      const p = ref[k][0];
      const j = judgeStroke([p, { x: p.x + 1, y: p.y + 1 }], k, ref);
      return !j.ok && j.reason === 'tooShort' ? null : describeJ(j);
    });
    expect(failures).toEqual([]);
  });
});

/* ───────── 判定：個別的字 ───────── */

describe('judgeStroke on specific characters', () => {
  it('あ: horizontal, vertical, then the loop', () => {
    const r = refOf('あ');
    expect(r.every((s, k) => judgeStroke(s, k, r).ok)).toBe(true);
    expect(judgeStroke(r[1], 0, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 1 });
    expect(judgeStroke(r[2], 0, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 2 });
    expect(judgeStroke(r[2], 1, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 2 });
    expect(judgeStroke(reversed(r[0]), 0, r)).toMatchObject({ ok: false, reason: 'direction' });
    expect(judgeStroke(reversed(r[2]), 2, r)).toMatchObject({ ok: false, reason: 'direction' });
    // 直線代替最後的大圈：不行
    expect(judgeStroke([r[2][0], r[2][r[2].length - 1]], 2, r).ok).toBe(false);
  });

  it('き: two parallel horizontals must come in order', () => {
    const r = refOf('き');
    expect(judgeStroke(r[1], 0, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 1 });
    expect(judgeStroke(r[3], 2, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 3 });
    const rnd = prng(42);
    expect(judgeStroke(jitter(scaleAbout(r[0], 0.9), 2, rnd), 0, r).ok).toBe(true);
  });

  it('さ: lenient on the small hook, strict on order and direction', () => {
    const r = refOf('さ');
    const s2 = r[1];
    expect(judgeStroke([s2[0], s2[s2.length - 1]], 1, r).ok).toBe(true); // 省略收筆的小勾也可以
    expect(judgeStroke(r[1], 0, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 1 });
    expect(judgeStroke(reversed(r[2]), 2, r)).toMatchObject({ ok: false, reason: 'direction' });
  });

  it('シ: ticks go down to the right, the last stroke sweeps upward', () => {
    const r = refOf('シ');
    for (let k = 0; k < 3; k++) expect(judgeStroke(reversed(r[k]), k, r)).toMatchObject({ ok: false, reason: 'direction' });
    const t = refOf('ツ');
    expect(judgeStroke(t[2], 2, r)).toMatchObject({ ok: false, reason: 'direction' }); // ツ 的第 3 筆是往下寫
    expect(acceptedAs('シ', 'ツ')).toBe(false);
  });

  it('ツ: the last stroke sweeps downward from the top right', () => {
    const r = refOf('ツ');
    for (let k = 0; k < 3; k++) expect(judgeStroke(reversed(r[k]), k, r)).toMatchObject({ ok: false, reason: 'direction' });
    expect(judgeStroke(r[2], 0, r)).toMatchObject({ ok: false, reason: 'order', matchedIndex: 2 });
    expect(acceptedAs('ツ', 'シ')).toBe(false);
  });

  it('ソ and ン are told apart by the second stroke', () => {
    const so = refOf('ソ');
    const n = refOf('ン');
    expect(judgeStroke(so[1], 1, n).ok).toBe(false);
    expect(judgeStroke(n[1], 1, so).ok).toBe(false);
    expect(judgeStroke(reversed(n[1]), 1, n)).toMatchObject({ ok: false, reason: 'direction' });
    expect(judgeStroke(reversed(so[1]), 1, so)).toMatchObject({ ok: false, reason: 'direction' });
    expect(acceptedAs('ン', 'ソ')).toBe(false);
    expect(acceptedAs('ソ', 'ン')).toBe(false);
  });

  it('が: the dakuten dots accept a tap, either direction, and either dot first', () => {
    const r = refOf('が');
    const dot = r[3];
    const c = centroid(dot);
    expect(judgeStroke([c, { x: c.x + 0.5, y: c.y + 0.5 }], 3, r).ok).toBe(true);
    expect(judgeStroke([centroid(r[4])], 4, r).ok).toBe(true);
    expect(judgeStroke(reversed(dot), 3, r).ok).toBe(true);
    expect(judgeStroke(r[4], 3, r).ok).toBe(true); // 兩點只差幾個單位，先寫哪一點都算
    expect(judgeStroke(jitter(dot, 3, prng(1)), 3, r).ok).toBe(true);
    expect(judgeStroke(scaleAbout(dot, 0.85), 3, r).ok).toBe(true);
    expect(judgeStroke([{ x: c.x - 30, y: c.y + 10 }], 3, r)).toMatchObject({ ok: false, reason: 'position' });
    expect(judgeStroke(translate(dot, 0, 30), 3, r)).toMatchObject({ ok: false, reason: 'position' });
    // 濁音點的位置上畫一條長線：不是點
    expect(judgeStroke([{ x: c.x - 15, y: c.y }, { x: c.x + 15, y: c.y }], 3, r).ok).toBe(false);
  });

  it('ぱ: the handakuten circle may start anywhere and go either way', () => {
    const r = refOf('ぱ');
    const circle = r[3];
    const c = centroid(circle);
    const ring = (radius: number, start: number, dir: 1 | -1) =>
      Array.from({ length: 40 }, (_, i) => {
        const a = start + (dir * 2 * Math.PI * i) / 39;
        return { x: c.x + radius * Math.cos(a), y: c.y + radius * Math.sin(a) };
      });
    expect(judgeStroke(reversed(circle), 3, r).ok).toBe(true);
    expect(judgeStroke([...circle.slice(20, -1), ...circle.slice(0, 21)], 3, r).ok).toBe(true);
    expect(judgeStroke(ring(6, 2, 1), 3, r).ok).toBe(true);
    expect(judgeStroke(ring(6, 0, -1), 3, r).ok).toBe(true);
    expect(judgeStroke(scaleAbout(circle, 0.6, c), 3, r).ok).toBe(true);
    expect(judgeStroke(jitter(circle, 3, prng(3)), 3, r).ok).toBe(true);
    expect(judgeStroke([c, { x: c.x + 1, y: c.y }], 3, r)).toMatchObject({ ok: false, reason: 'tooShort' });
    expect(judgeStroke([{ x: c.x - 7, y: c.y }, { x: c.x + 7, y: c.y }], 3, r).ok).toBe(false);
    expect(judgeStroke(translate(circle, -40, 30), 3, r)).toMatchObject({ ok: false, reason: 'position' });
  });

  it('ー: one stroke, left to right', () => {
    const r = refOf('ー');
    const s = r[0];
    expect(judgeStroke([s[0], s[s.length - 1]], 0, r).ok).toBe(true);
    expect(judgeStroke(reversed(s), 0, r)).toMatchObject({ ok: false, reason: 'direction' });
    expect(judgeStroke(translate(s, 0, 30), 0, r)).toMatchObject({ ok: false, reason: 'position' });
    expect(judgeStroke([{ x: 54, y: 15 }, { x: 54, y: 95 }], 0, r)).toMatchObject({ ok: false, reason: 'shape' });
    expect(judgeStroke([{ x: 50, y: 51 }, { x: 51, y: 51 }], 0, r)).toMatchObject({ ok: false, reason: 'tooShort' });
    expect(judgeStroke([{ x: 35, y: 51 }, { x: 75, y: 51 }], 0, r)).toMatchObject({ ok: false, reason: 'tooShort' });
    expect(acceptedAs('ー', 'へ')).toBe(false);
    expect(acceptedAs('へ', 'ー')).toBe(false);
  });
});

describe('judgeStroke tells confusable kana apart', () => {
  const pairs: [string, string][] = [
    ['シ', 'ツ'],
    ['ソ', 'ン'],
    ['る', 'ろ'],
    ['ぬ', 'め'],
    ['ね', 'れ'],
    ['れ', 'わ'],
    ['ね', 'わ'],
    ['う', 'ラ'],
    ['つ', 'フ'],
    ['く', 'へ'],
  ];
  for (const [a, b] of pairs) {
    it(`${a} ≠ ${b}`, () => {
      expect(acceptedAs(a, b)).toBe(false);
      expect(acceptedAs(b, a)).toBe(false);
    });
  }
});

describe('judgeStroke input handling', () => {
  it('treats an empty stroke as too short', () => {
    expect(judgeStroke([], 0, refOf('あ'))).toEqual({ ok: false, reason: 'tooShort', distance: Infinity });
  });

  it('rejects an out-of-range stroke index', () => {
    const r = refOf('あ');
    expect(() => judgeStroke(r[0], 3, r)).toThrow(RangeError);
    expect(() => judgeStroke(r[0], -1, r)).toThrow(RangeError);
    expect(() => judgeStroke(r[0], 0.5, r)).toThrow(RangeError);
  });

  it('works on raw pointer input with uneven spacing', () => {
    const r = refOf('ー');
    // 模擬手指：起筆慢、中間快、收筆慢
    const s = r[0];
    const raw: Pt[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = (1 - Math.cos((Math.PI * i) / 60)) / 2;
      raw.push(s[Math.round(t * (s.length - 1))]);
    }
    expect(judgeStroke(raw, 0, r).ok).toBe(true);
  });
});

describe('小字的範本（照第 6 課：寫成一半左右，放在格子左下方）', () => {
  const PAIRS: [string, string][] = [
    ['ゃ', 'や'], ['ゅ', 'ゆ'], ['ょ', 'よ'], ['っ', 'つ'],
    ['ャ', 'ヤ'], ['ュ', 'ユ'], ['ョ', 'ヨ'], ['ッ', 'ツ'],
  ];
  const box = (pts: Pt[]) => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };

  it('縮放：大寫指令（絕對座標）縮放加平移，小寫指令（相對座標）只縮放', () => {
    expect(shrinkSmallStroke('M10,20c1,2,3,4,5,6')).toBe('M12.28,48.88c0.62,1.24,1.86,2.48,3.1,3.72');
    expect(shrinkSmallStroke('M16,96c-1.5-2,3,4,5,6')).toBe('M16,96c-0.93,-1.24,1.86,2.48,3.1,3.72');
  });

  it('每個小字都在格子左下方、大約一般字的一半大', () => {
    for (const ch of SMALL_KANA) {
      if (!getStrokePaths(ch)) continue;
      const b = box(getStrokePoints(ch)!.flat());
      expect(b.x1, ch).toBeLessThan(62);
      expect(b.y0, ch).toBeGreaterThan(50);
      expect(b.y1, ch).toBeLessThan(100);
      expect(b.x0, ch).toBeGreaterThan(14);
    }
    // 一般的字不變
    expect(getStrokePaths('や')).toEqual(data.strokes['や']);
  });

  it('照課文把一般的字縮成一半、寫在左下方：每一筆都判對', () => {
    const half = (p: Pt): Pt => ({ x: 16 + (p.x - 16) * 0.5, y: 96 + (p.y - 96) * 0.5 });
    for (const [small, big] of PAIRS) {
      const ref = getStrokePoints(small)!;
      const written = getStrokePoints(big)!.map((stroke) => stroke.map(half));
      expect(written.length, small).toBe(ref.length);
      written.forEach((stroke, i) => expect(judgeStroke(stroke, i, ref).ok, `${small} 第 ${i + 1} 筆`).toBe(true));
    }
  });
});

/* ───────── 小字：門檻跟著縮小（反方向寫、只點一下不算對） ───────── */
describe('judgeStroke on small kana (thresholds scale with the glyph)', () => {
  const SMALL = [...'ゃゅょっャュョッァィゥェォ'].filter((ch) => getStrokePoints(ch));

  it('accepts the reference strokes and small jitter', () => {
    const rnd = prng(42);
    const failures: string[] = [];
    for (const ch of SMALL) {
      const ref = refOf(ch);
      const scale = judgeScale(ch);
      expect(scale).toBeLessThan(0.6);
      ref.forEach((_, k) => {
        if (!judgeStroke(ref[k], k, ref, scale).ok) failures.push(`${ch}#${k + 1} ref`);
        for (let rep = 0; rep < 4; rep++) {
          const j = judgeStroke(jitter(ref[k], 1.5, rnd), k, ref, scale);
          if (!j.ok) failures.push(`${ch}#${k + 1} jitter: ${describeJ(j)}`);
        }
      });
    }
    expect(failures).toEqual([]);
  });

  it('rejects reversed strokes and taps where the full-size kana would', () => {
    // 課程評審實測：這幾筆以前反方向寫、點一下都算對（大字的 よ、ツ、ウ 不算）
    for (const [ch, k] of [['ょ', 0], ['ッ', 0], ['ッ', 1], ['ゥ', 0], ['ゥ', 1]] as const) {
      const ref = refOf(ch);
      const scale = judgeScale(ch);
      const rev = judgeStroke(reversed(ref[k]), k, ref, scale);
      expect(rev.ok, `${ch}#${k + 1} 反方向`).toBe(false);
      expect(rev.reason).toBe('direction');
      const tap = judgeStroke([ref[k][0]], k, ref, scale);
      expect(tap.ok, `${ch}#${k + 1} 點一下`).toBe(false);
    }
    // 一般大小的字不受影響
    expect(judgeScale('あ')).toBe(1);
  });
});
