/**
 * 每天提醒：產生每天重複、20 分鐘的「日文自學」行程，加到 Google 行事曆或下載 .ics（iPhone、Mac、Outlook）。
 * 時間用當地時間、不帶時區：搬到別的時區，也是在當地的同一個時間提醒。
 */

export interface ReminderInput {
  /** HH:MM */
  time: string;
  /** 網站網址（行程說明裡附上連結） */
  url: string;
  now: number;
}

export const REMINDER_TITLE = '日文自學 20 分鐘';
const MINUTES = 20;

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** 第一次提醒：今天的這個時間還沒到就從今天開始，否則從明天開始 */
function firstSlot(time: string, now: number): { start: string; end: string } {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return { start: local(d), end: local(new Date(d.getTime() + MINUTES * 60_000)) };
}

const details = (url: string) => `打開日文自學教室，做完今天的任務：${url}`;

/** Google 行事曆的「新增活動」連結（每天重複） */
export function googleCalendarUrl({ time, url, now }: ReminderInput): string {
  const { start, end } = firstSlot(time, now);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: REMINDER_TITLE,
    details: details(url),
    dates: `${start}/${end}`,
    recur: 'RRULE:FREQ=DAILY',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** iCalendar 的文字值要跳脫 \ ; , 和換行 */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0)!;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/** 一行超過 75 個位元組要折行（續行開頭加一個空白），不能把中文字切一半 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (bytes + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** .ics 檔內容：每天重複的行程，開始時跳提醒 */
export function reminderIcs({ time, url, now }: ReminderInput): string {
  const { start } = firstSlot(time, now);
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//nihongo-classroom//daily reminder//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:nihongo-daily-${now}@nihongo-classroom`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DURATION:PT${MINUTES}M`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${text(REMINDER_TITLE)}`,
    `DESCRIPTION:${text(details(url))}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text('日文自學時間到了')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
