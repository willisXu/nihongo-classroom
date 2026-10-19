/**
 * Claude API（AI 日文家教用）：模型清單、費用估算、金鑰整理和錯誤型別。
 * 真正呼叫 API 的程式（含約 200 kB 的 Claude SDK）在 claude-api.ts，第一次呼叫時才載入。
 * 金鑰只存在使用者自己的瀏覽器，請求直接從瀏覽器送到 api.anthropic.com，
 * 不經過任何中間伺服器。因此需要 dangerouslyAllowBrowser，請不要把這個網站
 * 和別人共用同一把金鑰。
 */
import type { ModelId } from '../state';

export interface ModelInfo {
  id: ModelId;
  name: string;
  note: string;
  /** 每百萬 token 的美元價格（輸入、輸出）；Haiku 為起價 */
  price: [number, number];
  priceLabel: string;
}

export const MODELS: ModelInfo[] = [
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: '最快、最省錢', price: [0.1, 0.5], priceLabel: '輸入 $0.10 起／輸出 $0.50 起' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: '建議：品質和費用平衡', price: [2, 10], priceLabel: '輸入 $2／輸出 $10' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: '最強，費用較高', price: [4, 20], priceLabel: '輸入 $4／輸出 $20' },
];

export function modelInfo(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS[1];
}

/**
 * 估算費用（美元）。input 是沒有用到快取的輸入；
 * 寫進快取的輸入算 1.25 倍、從快取讀的算一成（Claude API 的 5 分鐘快取價格）。
 */
export function estimateCost(model: string, input: number, output: number, cacheWrite = 0, cacheRead = 0): number {
  const [pi, po] = modelInfo(model).price;
  return (input * pi + cacheWrite * pi * 1.25 + cacheRead * pi * 0.1 + output * po) / 1_000_000;
}

/** 一次呼叫寫進快取、從快取讀的輸入 token */
export interface CacheUsage {
  write: number;
  read: number;
}

export type Effort = 'low' | 'medium' | 'high';

export interface JsonCall {
  apiKey: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
  /** 把前面的對話快取起來（會話每一句都重送整段對話時用） */
  cache?: boolean;
  /** 伺服器開始回應（連上了）時呼叫：畫面從「連線中」換成「正在回覆」 */
  onConnect?: () => void;
  /** 收到回應就回報用量（即使之後因格式或截斷而失敗，也已經計費）；input 不含快取的部分 */
  onUsage?: (input: number, output: number, cache: CacheUsage) => void;
}

export interface JsonResult<T> {
  data: T;
  usage: { input: number; output: number };
}

export type TutorErrorKind =
  | 'auth' | 'billing' | 'rate' | 'busy' | 'network' | 'timeout' | 'too-long' | 'refusal' | 'invalid' | 'aborted' | 'other';

export class TutorError extends Error {
  constructor(message: string, readonly kind: TutorErrorKind) {
    super(message);
  }
}

/* ---------------- API 金鑰 ---------------- */

/** 複製貼上時常夾帶的空白、換行，和看不見的零寬字元、BOM */
export const INVISIBLE = /[\s\u200B-\u200D\u2060\uFEFF]/g;
const KEY_FORMAT = /^sk-ant-[A-Za-z0-9_-]+$/;

/**
 * 整理使用者貼上的 API 金鑰：去掉所有空白和看不見的字元，再檢查格式。
 * 夾帶這些字元的金鑰放進請求標頭會直接出錯，請求根本送不出去。
 * error 是要給使用者看的說明；格式正確時為 null。
 */
export function normalizeApiKey(raw: string): { key: string; error: string | null } {
  const key = raw.replace(INVISIBLE, '');
  if (!key) return { key, error: '請先貼上 API 金鑰。' };
  if (!key.startsWith('sk-ant-')) return { key, error: 'Anthropic 的 API 金鑰以 sk-ant- 開頭，請確認有沒有貼錯。' };
  if (!KEY_FORMAT.test(key)) {
    return { key, error: '金鑰裡有不該出現的字元（例如引號、標點或全形字）。請到 Claude Console 重新複製金鑰，直接貼上。' };
  }
  return { key, error: null };
}

export const TIMEOUT_MESSAGE =
  'Claude 太久沒有回應，已停止等待。請確認網路連線後再試一次；如果常常這樣，可以到「設定」換成較快的 Haiku 5.5。';

/** 一直連不上（伺服器沒有開始回應）：是網路或地區的問題，換模型沒有用 */
export const CONNECT_MESSAGE =
  '連不上 Claude API（等了很久都沒有回應）。請確認網路連線後再試；網路正常卻一直連不上的話，可能是所在的網路或地區連不到 api.anthropic.com。';

/* ---------------- 呼叫 API（第一次用到才載入 SDK） ---------------- */

type ApiModule = typeof import('./claude-api');
let api: ApiModule | undefined;

async function loadApi(): Promise<ApiModule> {
  if (api) return api;
  try {
    api = await import('./claude-api');
    return api;
  } catch {
    throw new TutorError('載入 AI 家教的程式失敗。請確認網路連線，重新整理頁面後再試一次。', 'network');
  }
}

/** 先在背景載入 SDK（進入 AI 家教頁時呼叫），第一次送出時就不用等 */
export function preloadClaudeApi(): void {
  void loadApi().catch(() => undefined);
}

/** 呼叫 Claude 並要求回傳符合 schema 的 JSON */
export async function callJSON<T>(req: JsonCall): Promise<JsonResult<T>> {
  return (await loadApi()).callJSON<T>(req);
}

/** 用一個很小的請求確認金鑰可用 */
export async function testConnection(apiKey: string, model: string): Promise<{ greeting: string; input: number; output: number }> {
  return (await loadApi()).testConnection(apiKey, model);
}

/** 任何錯誤轉成給使用者看的說明（SDK 還沒載入時，只可能是取消或其他意外） */
export function toTutorError(e: unknown): TutorError {
  if (e instanceof TutorError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new TutorError('已取消。', 'aborted');
  if (api) return api.toTutorError(e);
  return new TutorError('發生未預期的錯誤，請再試一次。', 'other');
}
