/**
 * Claude API 呼叫（AI 日文家教用）。
 * 金鑰只存在使用者自己的瀏覽器，請求直接從瀏覽器送到 api.anthropic.com，
 * 不經過任何中間伺服器。因此需要 dangerouslyAllowBrowser，請不要把這個網站
 * 和別人共用同一把金鑰。
 */
import Anthropic from '@anthropic-ai/sdk';
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

/** 估算費用（美元） */
export function estimateCost(model: string, input: number, output: number): number {
  const [pi, po] = modelInfo(model).price;
  return (input * pi + output * po) / 1_000_000;
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
  /** 收到回應就回報用量（即使之後因格式或截斷而失敗，也已經計費） */
  onUsage?: (input: number, output: number) => void;
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
const INVISIBLE = /[\s\u200B-\u200D\u2060\uFEFF]/g;
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

/* ---------------- 呼叫 API ---------------- */

/**
 * 一律用串流接收回覆：串流時 timeout 只算到伺服器開始回應為止，
 * 開始回應之後生成再久（Opus、較高的 effort）都不會被當成逾時。
 * 所以這個時間可以設短一點，網路不通時不必等太久（逾時會再重試兩次）。
 */
const CONNECT_TIMEOUT_MS = 30_000;

function client(apiKey: string) {
  return new Anthropic({
    apiKey: apiKey.replace(INVISIBLE, ''),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: CONNECT_TIMEOUT_MS,
  });
}

function joinText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** 呼叫 Claude 並要求回傳符合 schema 的 JSON */
export async function callJSON<T>(req: JsonCall): Promise<JsonResult<T>> {
  let res: Anthropic.Message;
  try {
    res = await client(req.apiKey)
      .messages.stream(
        {
          model: req.model,
          // 這是上限不是用量；模型思考的 token 也算在內，所以給寬一點
          max_tokens: req.maxTokens ?? 4000,
          system: req.system,
          messages: req.messages,
          output_config: {
            effort: req.effort ?? 'low',
            format: { type: 'json_schema', schema: req.schema },
          },
        },
        { signal: req.signal },
      )
      .finalMessage();
  } catch (e) {
    throw toTutorError(e);
  }
  req.onUsage?.(res.usage.input_tokens, res.usage.output_tokens);
  if (res.stop_reason === 'refusal') throw new TutorError('這個請求被模型拒絕了，換個說法再試一次。', 'refusal');
  if (res.stop_reason === 'max_tokens') throw new TutorError('回覆太長被截斷了，請再試一次。', 'invalid');
  let data: T;
  try {
    data = JSON.parse(joinText(res)) as T;
  } catch {
    throw new TutorError('收到的回覆格式不對，請再試一次。', 'invalid');
  }
  return { data, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

/** 用一個很小的請求確認金鑰可用：只要 API 回應成功就算通過 */
export async function testConnection(apiKey: string, model: string): Promise<{ greeting: string; input: number; output: number }> {
  try {
    const res = await client(apiKey)
      .messages.stream({
        model,
        max_tokens: 1024,
        system: 'Reply with one short Japanese greeting only.',
        messages: [{ role: 'user', content: '請用一句日文跟我打招呼。' }],
      })
      .finalMessage();
    const text = joinText(res).trim();
    return { greeting: text.slice(0, 60) || 'こんにちは', input: res.usage.input_tokens, output: res.usage.output_tokens };
  } catch (e) {
    throw toTutorError(e);
  }
}

/* ---------------- 錯誤訊息 ---------------- */

export const TIMEOUT_MESSAGE =
  'Claude 太久沒有回應，已停止等待。請確認網路連線後再試一次；如果常常這樣，可以到「設定」換成較快的 Haiku 5.5。';

/** API 原文訊息最多顯示幾個字 */
const DETAIL_MAX = 160;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 從 API 的錯誤回應取出錯誤類型（例如 billing_error）和原文訊息 */
function errorDetail(e: InstanceType<typeof Anthropic.APIError>): { type: string; message: string } {
  // 回應內容是 { type: 'error', error: { type, message } }；串流中途的錯誤事件也是同樣的格式
  const body: unknown = e.error;
  const inner = isRecord(body) ? (isRecord(body.error) ? body.error : body) : undefined;
  const type = e.type ?? (typeof inner?.type === 'string' ? inner.type : '');
  const message = typeof inner?.message === 'string' ? inner.message : typeof body === 'string' ? body : '';
  return { type, message: message.replace(/\s+/g, ' ').trim() };
}

function clip(text: string): string {
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX - 1)}…` : text;
}

export function toTutorError(e: unknown): TutorError {
  if (e instanceof TutorError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new TutorError('已取消。', 'aborted');
  // 逾時是連線錯誤的一種（子類別），要先判斷
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new TutorError(TIMEOUT_MESSAGE, 'timeout');
  if (e instanceof Anthropic.APIConnectionError) {
    return new TutorError('連不上 Claude API。請確認網路連線，或稍後再試。', 'network');
  }
  if (e instanceof Anthropic.APIError) {
    // 串流開始後才發生的錯誤沒有 HTTP 狀態碼，只能看錯誤類型
    const s = e.status;
    const { type, message } = errorDetail(e);
    if (s === 401 || type === 'authentication_error') return new TutorError('API 金鑰無效。請到「設定」重新貼上金鑰。', 'auth');
    if (s === 402 || type === 'billing_error' || (s === 400 && /credit|balance|billing/i.test(message))) {
      return new TutorError('API 帳戶餘額不足，或帳單、付款方式有問題。請到 Claude Console 的 Billing 頁面處理後再試。', 'billing');
    }
    if (s === 403 || type === 'permission_error') {
      return new TutorError('這把金鑰沒有使用這個模型的權限。請到 Claude Console 確認金鑰和帳戶狀態。', 'auth');
    }
    if (s === 404 || type === 'not_found_error') return new TutorError('找不到這個模型。請到「設定」換一個模型。', 'invalid');
    if (s === 413 || type === 'request_too_large' || /prompt is too long/i.test(message)) {
      return new TutorError('對話太長了，超過 API 的上限。請按「重新開始」重新開始這個情境。', 'too-long');
    }
    if (s === 429 || type === 'rate_limit_error') {
      return new TutorError('請求太頻繁或額度不足。稍等一下再試，或到 Claude Console 查看用量與帳單。', 'rate');
    }
    if (s === 504 || type === 'timeout_error') return new TutorError(TIMEOUT_MESSAGE, 'timeout');
    if (s === 529 || (s !== undefined && s >= 500) || type === 'overloaded_error' || type === 'api_error') {
      return new TutorError('Claude 目前比較忙，請稍後再試。', 'busy');
    }
    // 其他情況（例如工作區的用量上限）：附上 API 的原文說明，使用者才知道要處理什麼
    if (message) return new TutorError(`Claude API 無法處理這個請求：${clip(message)}`, 'invalid');
    if (s !== undefined) return new TutorError(`Claude API 無法處理這個請求（HTTP ${s}）。`, 'invalid');
  }
  // 其餘 SDK 錯誤多半是串流到一半連線斷了，或回應不完整
  if (e instanceof Anthropic.AnthropicError) return new TutorError('回覆傳到一半中斷了。請確認網路連線後再試一次。', 'network');
  return new TutorError('發生未預期的錯誤，請再試一次。', 'other');
}
