import { useState } from 'react';
import { addUsage, apiKeyStore, settingsStore, updateSettings, type ModelId } from '../state';
import { useStore } from '../state/store';
import { MODELS, normalizeApiKey, testConnection, toTutorError } from '../lib/claude';
import { Icon } from './Icon';

/** API 金鑰與模型設定（AI 家教頁和設定頁共用） */
export function ApiKeySetup({ compact = false }: { compact?: boolean }) {
  const saved = useStore(apiKeyStore);
  const settings = useStore(settingsStore);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'mark' | 'busy'; text: string } | null>(null);
  const [editing, setEditing] = useState(!saved);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // 貼上時預設遮起來（螢幕分享、錄影時不會露出整串金鑰）；用遮罩而不用密碼欄，瀏覽器才不會跳出「儲存密碼」
  const [reveal, setReveal] = useState(false);

  const save = async () => {
    // 去掉貼上時夾帶的換行、空白和看不見的字元，再檢查格式
    const { key, error } = normalizeApiKey(draft);
    if (error) {
      setStatus({ tone: 'mark', text: error });
      return;
    }
    setStatus({ tone: 'busy', text: '正在測試連線…' });
    try {
      const res = await testConnection(key, settings.model);
      addUsage(settings.model, res.input, res.output, false);
      apiKeyStore.set(key);
      setDraft('');
      setEditing(false);
      setStatus({ tone: 'ok', text: `連線成功，Claude 說：「${res.greeting}」` });
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
            type="text"
            className={`key-input ${reveal ? '' : 'masked'}`}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {/* 按鈕的字就是動作（顯示／隱藏），所以不另外標「按下」狀態 */}
          <button type="button" className="linkbtn" aria-controls="api-key" aria-label={reveal ? '隱藏金鑰' : '顯示金鑰'} onClick={() => setReveal((v) => !v)}>
            {reveal ? '隱藏' : '顯示'}
          </button>
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
