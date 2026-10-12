import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Inline } from '../data/types';
import { SayInline } from './Speak';

/**
 * 課程內文的迷你標記：**粗體**、[[かな]]、[[表記|よみ]]、{{かな}}、[文字](/路徑)
 */
const TOKEN = /(\[\[[^\]]+\]\])|(\{\{[^}]+\}\})|(\[[^[\]]+\]\([^)\s]+\))/g;

function renderTokens(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('[[')) {
      const inner = tok.slice(2, -2);
      const [shown, say] = inner.split('|');
      out.push(<SayInline key={key} text={shown} say={say ?? shown} />);
    } else if (tok.startsWith('{{')) {
      out.push(
        <span key={key} lang="ja" className="ja">
          {tok.slice(2, -2)}
        </span>,
      );
    } else {
      const label = tok.slice(1, tok.indexOf(']('));
      const href = tok.slice(tok.indexOf('](') + 2, -1);
      out.push(
        href.startsWith('/') ? (
          <Link key={key} to={href}>
            {label}
          </Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ),
      );
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rich({ text }: { text: Inline }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <b key={i}>{renderTokens(part, `b${i}`)}</b> : <Fragment key={i}>{renderTokens(part, `t${i}`)}</Fragment>,
      )}
    </>
  );
}
