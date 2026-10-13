import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'speaker' | 'home' | 'book' | 'pencil' | 'cards' | 'chat' | 'grid' | 'map' | 'gear'
  | 'target' | 'check' | 'close' | 'arrow-right' | 'arrow-left' | 'refresh' | 'play' | 'flame' | 'eye' | 'send' | 'stop' | 'note';

const PATHS: Record<IconName, ReactElement> = {
  speaker: (
    <>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  // 錯題本：筆記本加書籤
  note: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 3.5v17" />
      <path d="M12.5 3.5v6.5l2-1.6 2 1.6V3.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5c2.5-1 5.5-1 8 .8 2.5-1.8 5.5-1.8 8-.8V19c-2.5-1-5.5-1-8 .8-2.5-1.8-5.5-1.8-8-.8z" />
      <path d="M12 6.3v13.5" />
    </>
  ),
  pencil: (
    <>
      <path d="M5 19l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  cards: (
    <>
      <rect x="3.5" y="7" width="13" height="13" rx="2" />
      <path d="M8 4h10.5A2 2 0 0 1 20.5 6v10.5" />
    </>
  ),
  chat: (
    <>
      <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M12 4v16M4 12h16" strokeDasharray="2 2" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  refresh: (
    <>
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19 4.5V9h-4.5" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.2 2.4-5.2 3.7-7.6.4 1.6 1.3 2.6 2.3 3.1C11.8 7.6 13 5 15 3c.2 3 3.5 5.5 3.5 10.5 0 4.6-2.8 7.5-6.5 7.5z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  send: <path d="M4 11.5 20 4l-6.5 16-2.2-6.3z M11.3 13.7 20 4" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
