import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TIMEOUT_MESSAGE, TutorError, callJSON, normalizeApiKey, testConnection, toTutorError as toTutorErrorLazy } from '../src/lib/claude';
// 錯誤對照表在真正呼叫 API 的模組裡（含 SDK）；claude.ts 的 toTutorError 在 SDK 載入後會交給它
import { STREAM_LIMITS, estimateTokens, toTutorError } from '../src/lib/claude-api';

const KEY = 'sk-ant-api03-Ab_cd-EF12';

describe('normalizeApiKey', () => {
  it('accepts a clean key as is', () => {
    expect(normalizeApiKey(KEY)).toEqual({ key: KEY, error: null });
  });

  it('strips whitespace, line breaks and invisible characters anywhere in the key', () => {
    const messy = [
      `  ${KEY}\n`,
      'sk-ant-api03-Ab_cd\n-EF12',
      'sk-ant-api03-Ab_cd\r\n-EF12',
      'sk-ant-api03-Ab_cd -EF12',
      'sk-ant-api03-Ab_cd\t-EF12',
      'sk-ant-api03-Ab\u00A0_cd-EF12', // 不換行空白
      'sk-ant-api03-Ab_cd\u3000-EF12', // 全形空白
      `\uFEFF${KEY}`, // BOM
      `${KEY}\u200B`, // 零寬空白
      'sk-ant-\u200Capi03-Ab_cd\u200D-EF12',
      `sk-ant-api03-Ab_cd-EF12\u2060`,
    ];
    for (const raw of messy) expect(normalizeApiKey(raw), JSON.stringify(raw)).toEqual({ key: KEY, error: null });
  });

  it('explains what is wrong instead of letting the request fail', () => {
    expect(normalizeApiKey('').error).toMatch('請先貼上');
    expect(normalizeApiKey(' \n\u200B ').error).toMatch('請先貼上');
    expect(normalizeApiKey('api03-xxxx').error).toMatch('sk-ant-');
    expect(normalizeApiKey(`"${KEY}"`).error).toMatch('sk-ant-');
    for (const bad of [`${KEY}"`, `${KEY}。`, 'sk-ant-api03－ABC', 'sk-ant-金鑰', 'sk-ant-', `${KEY}=`]) {
      const res = normalizeApiKey(bad);
      expect(res.error, bad).toMatch('不該出現的字元');
    }
  });

  it('only ever returns keys that are valid header values', () => {
    for (const raw of [`${KEY}\u200B`, 'sk-ant-a\nb', '\uFEFFsk-ant-x y']) {
      const { key, error } = normalizeApiKey(raw);
      expect(error).toBeNull();
      expect(() => new Headers({ 'x-api-key': key })).not.toThrow();
    }
  });
});

/** 用 SDK 自己的方式產生 HTTP 錯誤（和真的收到錯誤回應時一樣） */
function httpError(status: number, type?: string, message?: string) {
  const body = type ? { type: 'error', error: { type, message: message ?? '' }, request_id: 'req_1' } : undefined;
  return Anthropic.APIError.generate(status, body, undefined, new Headers({ 'request-id': 'req_1' }));
}

/** 串流開始後才收到的錯誤事件：沒有 HTTP 狀態碼 */
function streamError(type: string, message: string) {
  return new Anthropic.APIError(undefined, { type: 'error', error: { type, message } }, undefined, new Headers(), type as Anthropic.ErrorType);
}

describe('toTutorError', () => {
  const map = (e: unknown) => {
    const t = toTutorError(e);
    return [t.kind, t.message] as const;
  };

  it('passes TutorError through', () => {
    const e = new TutorError('x', 'refusal');
    expect(toTutorError(e)).toBe(e);
  });

  it('maps abort, timeout and connection errors (timeout checked before its parent class)', () => {
    expect(map(new Anthropic.APIUserAbortError())).toEqual(['aborted', '已取消。']);
    const timeout = new Anthropic.APIConnectionTimeoutError();
    expect(timeout).toBeInstanceOf(Anthropic.APIConnectionError);
    expect(map(timeout)).toEqual(['timeout', TIMEOUT_MESSAGE]);
    expect(TIMEOUT_MESSAGE).toMatch('Haiku 5.5');
    expect(map(new Anthropic.APIConnectionError({ message: 'Connection error.' }))[0]).toBe('network');
  });

  it('keeps the existing status mappings', () => {
    expect(map(httpError(401, 'authentication_error', 'invalid x-api-key'))).toEqual(['auth', 'API 金鑰無效。請到「設定」重新貼上金鑰。']);
    expect(map(httpError(403, 'permission_error', 'nope'))[0]).toBe('auth');
    expect(map(httpError(404, 'not_found_error', 'model: claude-x'))[1]).toMatch('找不到這個模型');
    expect(map(httpError(429, 'rate_limit_error', 'slow down'))[0]).toBe('rate');
    expect(map(httpError(500, 'api_error', 'Internal server error'))[0]).toBe('busy');
    expect(map(httpError(503))[0]).toBe('busy');
    expect(map(httpError(529, 'overloaded_error', 'Overloaded'))).toEqual(['busy', 'Claude 目前比較忙，請稍後再試。']);
    expect(map(httpError(504, 'timeout_error', 'Request timed out'))).toEqual(['timeout', TIMEOUT_MESSAGE]);
  });

  it('tells the user about billing problems instead of "try again"', () => {
    const billing = map(httpError(402, 'billing_error', 'There is an issue with your billing or payment information.'));
    expect(billing[0]).toBe('billing');
    expect(billing[1]).toMatch('Claude Console');
    const credit = map(httpError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'));
    expect(credit[0]).toBe('billing');
    // 串流中途的帳單錯誤（沒有狀態碼，只有類型）
    expect(map(streamError('billing_error', 'billing'))[0]).toBe('billing');
  });

  it('asks to restart the scenario when the conversation is too long', () => {
    const tooLarge = map(httpError(413, 'request_too_large', 'Request exceeds the maximum allowed number of bytes.'));
    expect(tooLarge[0]).toBe('too-long');
    expect(tooLarge[1]).toMatch('重新開始');
    expect(map(httpError(400, 'invalid_request_error', 'prompt is too long: 1000001 tokens > 1000000 maximum'))[0]).toBe('too-long');
  });

  it('shows the API message for other client errors', () => {
    const msg = 'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.';
    const [kind, text] = map(httpError(400, 'invalid_request_error', msg));
    expect(kind).toBe('invalid');
    expect(text).toBe(`Claude API 無法處理這個請求：${msg}`);

    const long = `max_tokens: ${'x'.repeat(400)}`;
    const clipped = map(httpError(400, 'invalid_request_error', long))[1];
    const detail = clipped.replace('Claude API 無法處理這個請求：', '');
    expect(detail.length).toBeLessThanOrEqual(160);
    expect(detail.endsWith('…')).toBe(true);

    expect(map(httpError(400, 'invalid_request_error', 'line one\n  line two'))[1]).toMatch('line one line two');
    expect(map(httpError(422))[1]).toBe('Claude API 無法處理這個請求（HTTP 422）。');
  });

  it('maps errors that arrive mid-stream by their type', () => {
    expect(map(streamError('overloaded_error', 'Overloaded'))[0]).toBe('busy');
    expect(map(streamError('api_error', 'Internal server error'))[0]).toBe('busy');
    expect(map(streamError('rate_limit_error', 'slow'))[0]).toBe('rate');
    expect(map(streamError('invalid_request_error', 'something odd'))).toEqual(['invalid', 'Claude API 無法處理這個請求：something odd']);
  });

  it('treats other SDK errors as an interrupted stream and anything else as unexpected', () => {
    expect(map(new Anthropic.AnthropicError('stream ended without producing a Message with role=assistant'))[1]).toMatch('中斷');
    expect(map(new TypeError('boom'))).toEqual(['other', '發生未預期的錯誤，請再試一次。']);
    expect(map('weird')[0]).toBe('other');
  });
});

/* ---------------- 串流：用本機的假 API 測試 ---------------- */

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: Record<string, unknown>) => void;
let handler: Handler = () => {};
const requests: { body: Record<string, unknown>; headers: http.IncomingHttpHeaders }[] = [];
const closed: string[] = [];
let server: http.Server;
let savedBaseURL: string | undefined;

function sseHead(res: http.ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': 'req_stream' });
  res.flushHeaders();
}

function sseEvent(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** 依序送出一則完整的串流回覆：thinking 區塊 + 分段送出的 JSON 文字 */
function streamReply(res: http.ServerResponse, opts: { text: string; stop?: string; input?: number; output?: number }) {
  sseHead(res);
  sseEvent(res, 'message_start', {
    type: 'message_start',
    message: {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: opts.input ?? 1234, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null },
    },
  });
  sseEvent(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
  sseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '{"not":"the answer"}' } });
  sseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } });
  sseEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
  sseEvent(res, 'content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '', citations: null } });
  const half = Math.ceil(opts.text.length / 2);
  for (const part of [opts.text.slice(0, half), opts.text.slice(half)]) {
    sseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: part } });
  }
  sseEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 1 });
  sseEvent(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: opts.stop ?? 'end_turn', stop_sequence: null },
    usage: { output_tokens: opts.output ?? 567 },
  });
  sseEvent(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      requests.push({ body, headers: req.headers });
      res.on('close', () => closed.push(String(body.model)));
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  savedBaseURL = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (savedBaseURL === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = savedBaseURL;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  requests.length = 0;
  closed.length = 0;
});

const SCHEMA = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false };
const base = { apiKey: KEY, model: 'claude-sonnet-5-5', system: 'sys', messages: [{ role: 'user' as const, content: 'こんにちは' }], schema: SCHEMA };

async function failure(p: Promise<unknown>): Promise<TutorError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(TutorError);
    return e as TutorError;
  }
  throw new Error('expected a failure');
}

describe('callJSON (streaming)', () => {
  it('streams a structured reply, parses only the text blocks and reports usage', async () => {
    handler = (_req, res) => streamReply(res, { text: '{"reply":"いらっしゃいませ"}', input: 321, output: 45 });
    const usage: number[][] = [];
    const res = await callJSON<{ reply: string }>({ ...base, effort: 'medium', maxTokens: 6000, onUsage: (i, o) => usage.push([i, o]) });
    expect(res.data).toEqual({ reply: 'いらっしゃいませ' });
    expect(res.usage).toEqual({ input: 321, output: 45 });
    expect(usage).toEqual([[321, 45]]);

    expect(requests).toHaveLength(1);
    const { body, headers } = requests[0];
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(6000);
    expect(body.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } });
    expect(headers['x-api-key']).toBe(KEY);
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['x-stainless-timeout']).toBe('30');
  });

  it('cleans invisible characters out of the key before building the request', async () => {
    handler = (_req, res) => streamReply(res, { text: '{"reply":"x"}' });
    await callJSON({ ...base, apiKey: `${KEY}\u200B\n` });
    expect(requests[0].headers['x-api-key']).toBe(KEY);
  });

  it('reports usage for billed failures: refusal, max_tokens, malformed JSON', async () => {
    const cases: [string, string, string][] = [
      ['refusal', 'I cannot help with that.', 'refusal'],
      ['max_tokens', '{"reply":"こんに', 'invalid'],
      ['end_turn', 'not json', 'invalid'],
    ];
    for (const [stop, text, kind] of cases) {
      handler = (_req, res) => streamReply(res, { text, stop, input: 10, output: 20 });
      const usage: number[][] = [];
      const err = await failure(callJSON({ ...base, onUsage: (i, o) => usage.push([i, o]) }));
      expect(err.kind, stop).toBe(kind);
      expect(usage, stop).toEqual([[10, 20]]);
    }
  });

  it('can be stopped mid-stream with the AbortSignal', async () => {
    handler = (_req, res) => {
      sseHead(res);
      sseEvent(res, 'message_start', {
        type: 'message_start',
        message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } },
      });
      // 之後就不再送東西，等使用者按停止
    };
    const ctrl = new AbortController();
    const usage: number[][] = [];
    const pending = callJSON({ ...base, signal: ctrl.signal, onUsage: (i, o) => usage.push([i, o]) });
    await new Promise((r) => setTimeout(r, 150));
    ctrl.abort();
    const err = await failure(pending);
    expect(err.kind).toBe('aborted');
    expect(usage, '已經送出的輸入照樣計費，要記進用量').toEqual([[5, 1]]);
    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toHaveLength(1); // 連線真的關掉了
  });

  it('estimates the output of a reply stopped halfway from what was already streamed', async () => {
    handler = (_req, res) => {
      sseHead(res);
      sseEvent(res, 'message_start', {
        type: 'message_start',
        message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } },
      });
      sseEvent(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
      sseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'The learner asked for ramen.' } });
      sseEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
      sseEvent(res, 'content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } });
      sseEvent(res, 'content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '{"reply":"いらっしゃいませ' } });
      // 之後停住，等使用者按停止
    };
    const ctrl = new AbortController();
    const usage: number[][] = [];
    const pending = callJSON({ ...base, signal: ctrl.signal, onUsage: (i, o) => usage.push([i, o]) });
    await new Promise((r) => setTimeout(r, 150));
    ctrl.abort();
    expect((await failure(pending)).kind).toBe('aborted');
    // 英數字：思考 28 個＋ {"reply":" 10 個，共 38 個 ÷ 4 = 9.5；假名 いらっしゃいませ 8 個 → 17.5，進位成 18
    expect(usage).toEqual([[5, 18]]);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('らーめん')).toBe(4);
  });

  it('stops a stream that stalls after it started, and still reports the billed usage', async () => {
    handler = (_req, res) => {
      sseHead(res);
      sseEvent(res, 'message_start', {
        type: 'message_start',
        message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 7, output_tokens: 1 } },
      });
      // 之後就沒有任何資料（連線也沒斷）
    };
    const saved = STREAM_LIMITS.stallMs;
    STREAM_LIMITS.stallMs = 200;
    try {
      const usage: number[][] = [];
      const err = await failure(callJSON({ ...base, onUsage: (i, o) => usage.push([i, o]) }));
      expect(err.kind).toBe('timeout');
      expect(err.message).toMatch(/太久沒有動靜/);
      expect(usage).toEqual([[7, 1]]);
    } finally {
      STREAM_LIMITS.stallMs = saved;
    }
  });

  it('says the chat is too long when the model runs out of context', async () => {
    handler = (_req, res) => streamReply(res, { text: '{"reply":"', stop: 'model_context_window_exceeded', input: 10, output: 2 });
    const err = await failure(callJSON(base));
    expect(err.kind).toBe('too-long');
  });

  it('rejects at once when the signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect((await failure(callJSON({ ...base, signal: ctrl.signal }))).kind).toBe('aborted');
    expect(requests).toHaveLength(0);
  });

  it('maps an error event in the middle of the stream', async () => {
    handler = (_req, res) => {
      sseHead(res);
      sseEvent(res, 'error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
      res.end();
    };
    expect((await failure(callJSON(base))).kind).toBe('busy');
  });

  it('treats a stream that ends early as interrupted', async () => {
    handler = (_req, res) => {
      sseHead(res);
      res.end();
    };
    expect((await failure(callJSON(base))).message).toMatch('中斷');
  });

  it('maps HTTP errors before the stream starts (no retries for 4xx)', async () => {
    handler = (_req, res) => {
      res.writeHead(402, { 'content-type': 'application/json', 'request-id': 'req_x' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'billing_error', message: 'There is an issue with your billing or payment information.' } }));
    };
    expect((await failure(callJSON(base))).kind).toBe('billing');
    expect(requests).toHaveLength(1);

    requests.length = 0;
    handler = (_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json', 'request-id': 'req_y' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified workspace API usage limits.' } }));
    };
    expect((await failure(callJSON(base))).message).toBe('Claude API 無法處理這個請求：You have reached your specified workspace API usage limits.');
  });
});

describe('testConnection (streaming)', () => {
  it('returns the greeting and usage', async () => {
    handler = (_req, res) => streamReply(res, { text: 'こんにちは！', input: 30, output: 8 });
    expect(await testConnection(KEY, 'claude-haiku-5-5')).toEqual({ greeting: 'こんにちは！', input: 30, output: 8 });
    expect(requests[0].body.stream).toBe(true);
    expect(requests[0].body.output_config).toBeUndefined();
  });

  it('maps errors', async () => {
    handler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    };
    expect((await failure(testConnection(KEY, 'claude-haiku-5-5'))).kind).toBe('auth');
  });
});

describe('SDK 延後載入', () => {
  it('SDK 還沒載入前，取消和意外錯誤也有說明；載入後交給完整的對照表', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(toTutorErrorLazy(abort).kind).toBe('aborted');
    await import('../src/lib/claude-api');
    const e = new Anthropic.APIConnectionTimeoutError();
    // 測試裡 callJSON 已經跑過，SDK 已載入
    expect(toTutorErrorLazy(e).message).toBe(TIMEOUT_MESSAGE);
  });
});
