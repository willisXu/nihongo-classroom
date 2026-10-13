/**
 * 真正呼叫 Claude API 的部分。這個檔案會把 Claude SDK 一起打包（約 200 kB），
 * 所以只由 claude.ts 在第一次呼叫時動態載入，平常不拖慢網站。
 */
import Anthropic from '@anthropic-ai/sdk';
import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import { INVISIBLE, TIMEOUT_MESSAGE, TutorError, type JsonCall, type JsonResult } from './claude';

/* ---------------- 呼叫 API ---------------- */

/**
 * 一律用串流接收回覆：串流時 timeout 只算到伺服器開始回應為止，
 * 開始回應之後生成再久（Opus、較高的 effort）都不會被當成逾時。
 * 所以這個時間可以設短一點，網路不通時不必等太久（逾時會再重試兩次）。
 */
const CONNECT_TIMEOUT_MS = 30_000;

/**
 * stallMs：開始回應之後，超過這麼久沒有收到任何資料就當成卡住並停止
 * （例如手機休眠後連線默默斷掉，不會出錯，畫面卻一直顯示「正在回覆」）。
 * testMs：測試金鑰最多等多久（「測試並儲存」沒有取消鍵）。測試時會調短。
 */
export const STREAM_LIMITS = { stallMs: 60_000, testMs: 45_000 };

const STALL_MESSAGE = '回覆太久沒有動靜，已經停止。請確認網路連線後再試一次。';

function client(apiKey: string, maxRetries = 2) {
  return new Anthropic({
    apiKey: apiKey.replace(INVISIBLE, ''),
    dangerouslyAllowBrowser: true,
    maxRetries,
    timeout: CONNECT_TIMEOUT_MS,
  });
}

/**
 * 用字數估 token：英數大約 4 個字一個 token，中日文大約一個字一個。
 * 串流到一半停下來時，最後的用量還沒送到（開頭只有輸出 1 個的暫定值），用收到的內容估輸出。
 * 模型思考的內容只會送出摘要，所以這仍然是偏低的估計。
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4 + other);
}

/**
 * 等串流結束，拿到完整回覆。另外處理兩件事：
 * - 開始回應後太久沒有資料（或超過 limitMs）就停止，回報逾時
 * - 中途取消或出錯時，已經送出的輸入和產生到一半的輸出照樣計費：把用量回報出去（輸出用收到的內容估）
 */
async function finish(stream: MessageStream, onUsage?: (input: number, output: number) => void, limitMs?: number): Promise<Anthropic.Message> {
  let stalled = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let received = '';
  const stop = () => {
    stalled = true;
    stream.abort();
  };
  const kick = () => {
    clearTimeout(idle);
    idle = setTimeout(stop, STREAM_LIMITS.stallMs);
  };
  stream.on('connect', kick);
  stream.on('streamEvent', (event) => {
    kick();
    if (event.type !== 'content_block_delta') return;
    const d = event.delta;
    if (d.type === 'text_delta') received += d.text;
    else if (d.type === 'thinking_delta') received += d.thinking;
    else if (d.type === 'input_json_delta') received += d.partial_json;
  });
  const limit = limitMs ? setTimeout(stop, limitMs) : undefined;
  try {
    return await stream.finalMessage();
  } catch (e) {
    const usage = stream.currentMessage?.usage;
    if (usage) onUsage?.(usage.input_tokens, Math.max(usage.output_tokens, estimateTokens(received)));
    if (stalled) throw new TutorError(STALL_MESSAGE, 'timeout');
    throw toTutorError(e);
  } finally {
    clearTimeout(idle);
    clearTimeout(limit);
  }
}

function joinText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** 呼叫 Claude 並要求回傳符合 schema 的 JSON */
export async function callJSON<T>(req: JsonCall): Promise<JsonResult<T>> {
  const stream = client(req.apiKey).messages.stream(
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
  );
  const res = await finish(stream, req.onUsage);
  req.onUsage?.(res.usage.input_tokens, res.usage.output_tokens);
  if (res.stop_reason === 'refusal') throw new TutorError('這個請求被模型拒絕了，換個說法再試一次。', 'refusal');
  if (res.stop_reason === 'max_tokens') throw new TutorError('回覆太長被截斷了，請再試一次。', 'invalid');
  if (res.stop_reason === 'model_context_window_exceeded') {
    throw new TutorError('對話太長了，超過模型能讀的長度。請按「重新開始」重新開始這個情境。', 'too-long');
  }
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
  const stream = client(apiKey, 1).messages.stream({
    model,
    max_tokens: 1024,
    system: 'Reply with one short Japanese greeting only.',
    messages: [{ role: 'user', content: '請用一句日文跟我打招呼。' }],
  });
  const res = await finish(stream, undefined, STREAM_LIMITS.testMs);
  const text = joinText(res).trim();
  return { greeting: text.slice(0, 60) || 'こんにちは', input: res.usage.input_tokens, output: res.usage.output_tokens };
}

/* ---------------- 錯誤訊息 ---------------- */



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
    return new TutorError(
      '連不上 Claude API。請確認網路連線後再試；網路正常卻一直連不上的話，可能是所在的網路或地區連不到 api.anthropic.com。',
      'network',
    );
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
      // 金鑰權限不足，或從 Claude API 不提供服務的地區連線；附上 API 的原文說明比較好判斷
      const detail = message ? `（API 說明：${clip(message)}）` : '';
      return new TutorError(`這把金鑰沒有權限，或所在的地區不在 Claude API 的服務範圍。請到 Claude Console 確認金鑰和帳戶狀態。${detail}`, 'auth');
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
