/**
 * Claude API 呼叫（AI 日文家教用）。
 * 金鑰只存在使用者自己的瀏覽器，請求直接從瀏覽器送到 api.anthropic.com，
 * 不經過任何中間伺服器。因此需要 dangerouslyAllowBrowser，請不要把這個網站
 * 和別人共用同一把金鑰。
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ModelId } from '../state';
import { obj } from './schema';

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
}

export interface JsonResult<T> {
  data: T;
  usage: { input: number; output: number };
}

export class TutorError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'rate' | 'busy' | 'network' | 'refusal' | 'invalid' | 'other') {
    super(message);
  }
}

function client(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 60_000 });
}

/** 呼叫 Claude 並要求回傳符合 schema 的 JSON */
export async function callJSON<T>(req: JsonCall): Promise<JsonResult<T>> {
  let res: Anthropic.Message;
  try {
    res = await client(req.apiKey).messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 1500,
        system: req.system,
        messages: req.messages,
        output_config: {
          effort: req.effort ?? 'low',
          format: { type: 'json_schema', schema: req.schema },
        },
      },
      { signal: req.signal },
    );
  } catch (e) {
    throw toTutorError(e);
  }
  if (res.stop_reason === 'refusal') throw new TutorError('這個請求被模型拒絕了，換個說法再試一次。', 'refusal');
  if (res.stop_reason === 'max_tokens') throw new TutorError('回覆太長被截斷了，請再試一次。', 'invalid');
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new TutorError('收到的回覆格式不對，請再試一次。', 'invalid');
  }
  return { data, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

export function toTutorError(e: unknown): TutorError {
  if (e instanceof TutorError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new TutorError('已取消。', 'other');
  if (e instanceof Anthropic.APIConnectionError) {
    return new TutorError('連不上 Claude API。請確認網路連線，或稍後再試。', 'network');
  }
  if (e instanceof Anthropic.APIError) {
    const s = e.status;
    if (s === 401) return new TutorError('API 金鑰無效。請到「設定」重新貼上金鑰。', 'auth');
    if (s === 403) return new TutorError('這把金鑰沒有使用這個模型的權限。請到 Claude Console 確認金鑰和帳戶狀態。', 'auth');
    if (s === 404) return new TutorError('找不到這個模型。請到「設定」換一個模型。', 'invalid');
    if (s === 429) return new TutorError('請求太頻繁或額度不足。稍等一下再試，或到 Claude Console 查看用量與帳單。', 'rate');
    if (s === 529 || (s !== undefined && s >= 500)) return new TutorError('Claude 目前比較忙，請稍後再試。', 'busy');
    if (s === 400) {
      const msg = String(e.message || '');
      if (/credit|balance|billing/i.test(msg)) return new TutorError('API 帳戶餘額不足。請到 Claude Console 儲值後再試。', 'rate');
      return new TutorError('請求格式有問題，請再試一次。', 'invalid');
    }
  }
  return new TutorError('發生未預期的錯誤，請再試一次。', 'other');
}

/** 用一個很小的請求確認金鑰可用 */
export async function testConnection(apiKey: string, model: string): Promise<JsonResult<{ greeting: string }>> {
  return callJSON<{ greeting: string }>({
    apiKey,
    model,
    system: 'Reply with a short Japanese greeting.',
    messages: [{ role: 'user', content: '請用一句日文跟我打招呼。' }],
    schema: obj({ greeting: { type: 'string' } }),
    maxTokens: 200,
  });
}
