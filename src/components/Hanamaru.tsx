import { useEffect, useRef } from 'react';

/** 老師批改用的「花丸」：螺旋加花瓣，答對時用紅筆畫出來 */
const PATH = (() => {
  const cx = 50;
  const cy = 50;
  const turns = 2.2;
  const steps = 64;
  const rMax = 25;
  const a0 = -Math.PI / 2;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + t * turns * 2 * Math.PI;
    const r = 3 + t * (rMax - 3);
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  }
  const n = 7;
  const rIn = 33;
  const rCtl = 54;
  const aEnd = a0 + turns * 2 * Math.PI;
  for (let k = 0; k <= n; k++) {
    const ak = aEnd + (k * 2 * Math.PI) / n;
    const x = cx + rIn * Math.cos(ak);
    const y = cy + rIn * Math.sin(ak);
    if (k === 0) {
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      continue;
    }
    const am = ak - Math.PI / n;
    d += `Q${(cx + rCtl * Math.cos(am)).toFixed(1)} ${(cy + rCtl * Math.sin(am)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
})();

export function Hanamaru({ show, className = '' }: { show: boolean; className?: string }) {
  const ref = useRef<SVGPathElement>(null);
  useEffect(() => {
    const p = ref.current;
    if (!p || !show) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let len = 600;
    try {
      len = p.getTotalLength();
    } catch {
      /* jsdom 等環境 */
    }
    p.style.transition = 'none';
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = reduce ? '0' : String(len);
    if (!reduce) {
      p.getBoundingClientRect();
      p.style.transition = 'stroke-dashoffset .6s ease-out';
      p.style.strokeDashoffset = '0';
    }
  }, [show]);
  return (
    <svg className={`hanamaru ${show ? 'on' : ''} ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path ref={ref} d={PATH} />
    </svg>
  );
}
