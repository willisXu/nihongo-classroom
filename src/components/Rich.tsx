import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Inline } from '../data/types';
import { SayInline } from './Speak';
import { JaParts } from './Ja';
import { inlineSay } from '../lib/ja';

/**
 * 課程內文的迷你標記：**粗體**、[[かな]]、[[表記|よみ]]、{{かな}}、[文字](/路徑)
 * [[ ]]、{{ }} 裡的日文可以用《》標讀音（見 lib/ja.ts），例如 [[学生《がくせい》]]。
 */
const TOKEN = /(\[\[[^\]]+\]\])|(\{\{[^}]+\}\})|(\[[^[\]]+\]\([^)\s]+\))/g;

/**
 * 中文句子裡的一段假名（含長音符號）。中點「・」不算進去：日文字型的中點比較窄，
 * 「き・や」會變成擠在一起的「き•や」。
 */
const KANA_RUN = /[\u3041-\u3096\u30a1-\u30fa\u30fc]+/gu;

/**
 * 混在中文裡的假名標成日文（螢幕閱讀器才會用日文念），字型照原本的。
 * 課文裡沒有用 [[ ]]、{{ }} 標起來的假名都經過這裡。
 * 標題不標：標題字型遇到日文會換成日文字形，「か行・さ行」字距會跑掉。
 */
function markKana(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(KANA_RUN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <span key={`${keyBase}-k${i++}`} lang="ja" className="ja-inline">
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderTokens(text: string, keyBase: string, inert: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...markKana(text.slice(last, at), `${keyBase}-p${i}`));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('[[') && !inert) {
      const inner = tok.slice(2, -2);
      const [shown, say] = inner.split('|');
      // 〜、空格不念，句型開頭的助詞照助詞念（[[〜は]] 念 wa）；只有一個詞的念讀音（[[十《とお》]]）
      out.push(<SayInline key={key} text={shown} say={say ?? inlineSay(shown)} />);
    } else if (tok.startsWith('[[')) {
      out.push(
        <span key={key} lang="ja" className="ja">
          <JaParts text={tok.slice(2, -2).split('|')[0]} />
        </span>,
      );
    } else if (inert && !tok.startsWith('{{')) {
      out.push(...markKana(tok.slice(1, tok.indexOf('](')), key));
    } else if (tok.startsWith('{{')) {
      out.push(
        <span key={key} lang="ja" className="ja">
          <JaParts text={tok.slice(2, -2)} />
        </span>,
      );
    } else {
      const label = tok.slice(1, tok.indexOf(']('));
      const href = tok.slice(tok.indexOf('](') + 2, -1);
      out.push(
        href.startsWith('/') ? (
          <Link key={key} to={href}>
            {markKana(label, key)}
          </Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {markKana(label, key)}
          </a>
        ),
      );
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(...markKana(text.slice(last), `${keyBase}-end`));
  return out;
}

/**
 * inert：放在按鈕裡面（例如整張可以點來發音的單字卡）時用。[[ ]] 不做成發音鍵、連結只顯示文字：
 * 按鈕裡不能再放按鈕和連結（點了只會觸發外面那顆）。
 */
export function Rich({ text, inert = false }: { text: Inline; inert?: boolean }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <b key={i}>{renderTokens(part, `b${i}`, inert)}</b>
        ) : (
          <Fragment key={i}>{renderTokens(part, `t${i}`, inert)}</Fragment>
        ),
      )}
    </>
  );
}
