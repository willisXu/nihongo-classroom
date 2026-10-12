import { useState } from 'react';
import { apiKeyStore, settingsStore, updateSettings, type ModelId } from '../state';
import { useStore } from '../state/store';
import { MODELS, testConnection, toTutorError } from '../lib/claude';
import { Icon } from './Icon';

/** API 金鑰與模型設定（AI 家教頁和設定頁共用） */
export function ApiKeySetup({ compact = false }: { compact?: boolean }) {
  const saved = useStore(apiKeyStore);
  const settings = useStore(settingsStore);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'mark' | 'busy'; text: string } | null>(null);
  const [editing, setEditing] = useState(!saved);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async () => {
    const key = draft.trim();
    if (!key) {
      setStatus({ tone: 'mark', text: '請先貼上 API 金鑰。' });
      return;
    }
    if (!key.startsWith('sk-ant-')) {
      setStatus({ tone: 'mark', text: 'Anthropic 的 API 金鑰以 sk-ant- 開頭，請確認有沒有貼錯。' });
      return;
    }
    setStatus({ tone: 'busy', text: '正在測試連線…' });
    try {
      const res = await testConnection(key, settings.model);
      apiKeyStore.set(key);
      setDraft('');
      setEditing(false);
      setStatus({ tone: 'ok', text: `連線成功，Claude 說：「${res.data.greeting}」` });
    } catch (e) {
      setStatus({ tone: 'mark', text: toTutorError(e).message });
    }
  };

  return (
    <div className={`apikey ${compact ? 'apikey-compact' : ''}`}>
      {!compact ? (
        <ol className="steps">
          <li>
            到{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              Claude Console
            </a>{' '}
            登入，在 API Keys 建立一把金鑰（需要先儲值，幾美元就能用很久）。
          </li>
          <li>把金鑰貼到下面，按「測試並儲存」。</li>
          <li>金鑰只存在這個瀏覽器，請求直接從你的瀏覽器送到 Anthropic，不經過其他伺服器。匯出的備份也不包含金鑰。</li>
        </ol>
      ) : null}

      {saved && !editing ? (
        <div className="key-row">
          <span className="key-mask">
            <Icon name="check" size={16} /> 已設定金鑰（…{saved.slice(-4)}）
          </span>
          <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
            更換
          </button>
          {confirmRemove ? (
            <>
              <span>確定移除？</span>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  apiKeyStore.reset();
                  setConfirmRemove(false);
                  setEditing(true);
                  setStatus(null);
                }}
              >
                移除
              </button>
              <button type="button" className="linkbtn" onClick={() => setConfirmRemove(false)}>
                取消
              </button>
            </>
          ) : (
            <button type="button" className="linkbtn" onClick={() => setConfirmRemove(true)}>
              移除
            </button>
          )}
        </div>
      ) : (
        <form
          className="key-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="api-key" className="sr-only">
            Anthropic API 金鑰
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={status?.tone === 'busy'}>
            測試並儲存
          </button>
          {saved ? (
            <button type="button" className="linkbtn" onClick={() => setEditing(false)}>
              取消
            </button>
          ) : null}
        </form>
      )}

      <div className="model-pick">
        <label htmlFor="model">模型</label>
        <select id="model" value={settings.model} onChange={(e) => updateSettings({ model: e.target.value as ModelId })}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}：{m.note}
            </option>
          ))}
        </select>
        <p className="small">
          價格（每百萬 token，美元）：{MODELS.find((m) => m.id === settings.model)?.priceLabel}。一次會話往返通常只用幾千個 token。
        </p>
      </div>

      {status ? (
        <p className={`key-status tone-${status.tone}`} role="status">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
