import { useRef, useState } from 'react';
import { NEW_PER_DAY_OPTIONS, settingsStore, updateSettings, usageStore, exportBackup, importBackup, resetAllProgress, type ThemePref } from '../state';
import { useStore } from '../state/store';
import { useSpeech, speak } from '../lib/speech';
import { estimateCost, modelInfo } from '../lib/claude';
import { ApiKeySetup } from '../components/ApiKeySetup';
import { Segmented, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';

export default function Settings() {
  const settings = useStore(settingsStore);
  const usage = useStore(usageStore);
  const speech = useSpeech();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'mark'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  const totalCost = Object.entries(usage.byModel).reduce((sum, [m, u]) => sum + estimateCost(m, u.input, u.output), 0);

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `nihongo-classroom-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ tone: 'ok', text: '已下載備份檔。到另一台裝置打開這個網站，用「匯入備份」就能接著學。' });
  };

  const onFile = async (f: File | null) => {
    setPendingImport(null);
    if (!f) return;
    try {
      const n = importBackup(await f.text());
      setMsg({ tone: 'ok', text: `匯入完成，還原了 ${n} 類學習紀錄。` });
    } catch (e) {
      setMsg({ tone: 'mark', text: e instanceof Error ? e.message : '匯入失敗。' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="wrap settings-page">
      <header className="ph">
        <p className="eyebrow">設定</p>
        <h1>設定與資料</h1>
      </header>

      <section className="block" aria-labelledby="h-look">
        <h2 id="h-look">外觀</h2>
        <div className="set-row">
          <span className="set-l wide">主題</span>
          <Segmented<ThemePref>
            label="主題"
            value={settings.theme}
            onChange={(v) => updateSettings({ theme: v })}
            options={[
              { value: 'system', label: '跟隨系統' },
              { value: 'light', label: '筆記紙' },
              { value: 'dark', label: '黑板' },
            ]}
          />
        </div>
      </section>

      <section className="block" aria-labelledby="h-voice">
        <h2 id="h-voice">發音</h2>
        <Switch id="set-slow" checked={settings.slow} onChange={(v) => updateSettings({ slow: v })}>
          慢速發音
        </Switch>
        <div className="set-row">
          <label className="set-l wide" htmlFor="voice">
            日文語音
          </label>
          <select id="voice" value={settings.voiceURI} onChange={(e) => updateSettings({ voiceURI: e.target.value })} disabled={!speech.voices.length}>
            <option value="">自動挑選</option>
            {speech.voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={() => speak('こんにちは。にほんごを べんきょうしましょう。')}>
            <Icon name="speaker" size={16} /> 聽聽看
          </button>
        </div>
        <p className="small">
          {!speech.supported
            ? '這個瀏覽器不支援語音合成。'
            : speech.hasJapanese
              ? `找到 ${speech.voices.length} 個日文語音。Edge 的「Nanami」和 Chrome 的「Google 日本語」比較自然。`
              : '還沒有找到日文語音。Windows 請到「設定 → 時間與語言 → 語音 → 新增語音」加入日文；Mac 請到「系統設定 → 輔助使用 → 朗讀內容 → 系統語音 → 管理語音」加入日文。也可以改用 Edge 瀏覽器，它內建日文語音。'}
        </p>
      </section>

      <section className="block" aria-labelledby="h-cards">
        <h2 id="h-cards">單字卡</h2>
        <div className="set-row">
          <label className="set-l wide" htmlFor="set-newper">
            每天新卡
          </label>
          <select id="set-newper" value={settings.newPerDay} onChange={(e) => updateSettings({ newPerDay: Number(e.target.value) })}>
            {NEW_PER_DAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 張
              </option>
            ))}
          </select>
        </div>
        <Switch id="set-romaji" checked={settings.showRomaji} onChange={(v) => updateSettings({ showRomaji: v })}>
          顯示羅馬拼音（熟悉假名後建議關掉）
        </Switch>
      </section>

      <section className="block" aria-labelledby="h-ai">
        <h2 id="h-ai">AI 家教</h2>
        <ApiKeySetup />
        <div className="usage card">
          <p className="c-label">這個瀏覽器的累計用量</p>
          <p>
            {usage.calls} 次呼叫 · 輸入 {usage.input.toLocaleString()} token · 輸出 {usage.output.toLocaleString()} token · 約 US${totalCost.toFixed(3)}
          </p>
          {Object.keys(usage.byModel).length ? (
            <ul className="small">
              {Object.entries(usage.byModel).map(([m, u]) => (
                <li key={m}>
                  {modelInfo(m).name}：輸入 {u.input.toLocaleString()}、輸出 {u.output.toLocaleString()}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="small">費用是依公開價格估算，實際金額以 Claude Console 的帳單為準。</p>
        </div>
      </section>

      <section className="block" aria-labelledby="h-data">
        <h2 id="h-data">學習紀錄</h2>
        <p>課程進度、假名測驗、手寫、單字卡紀錄都只存在這個瀏覽器。換電腦或換瀏覽器前，先匯出備份。</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={download}>
            匯出備份
          </button>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            className="sr-only file-input"
            onChange={(e) => setPendingImport(e.target.files?.[0] ?? null)}
          />
          <label className="btn" htmlFor="import-file">
            匯入備份
          </label>
        </div>
        {pendingImport ? (
          <div className="reset-row confirm-row" role="alert">
            <span>匯入「{pendingImport.name}」會覆蓋這個瀏覽器目前的學習紀錄，確定嗎？</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void onFile(pendingImport)}>
              匯入
            </button>
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setPendingImport(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              取消
            </button>
          </div>
        ) : null}
        {msg ? (
          <p className={`key-status tone-${msg.tone}`} role="status">
            {msg.text}
          </p>
        ) : null}
        <div className="reset-row">
          {confirmReset ? (
            <>
              <span>會清除課程、測驗、手寫、單字卡與用量紀錄（API 金鑰和設定保留），確定嗎？</span>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  resetAllProgress();
                  setConfirmReset(false);
                  setMsg({ tone: 'ok', text: '已清除所有學習紀錄。' });
                }}
              >
                全部清除
              </button>
              <button type="button" className="linkbtn" onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </>
          ) : (
            <button type="button" className="linkbtn danger" onClick={() => setConfirmReset(true)}>
              清除所有學習紀錄
            </button>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="h-about">
        <h2 id="h-about">關於</h2>
        <ul className="facts">
          <li>
            筆順資料：
            <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener noreferrer">
              KanjiVG
            </a>
            ，© Ulrich Apel，以 CC BY-SA 3.0 授權。
          </li>
          <li>字型：Klee One、LXGW WenKai TC、Noto Sans TC，皆以 SIL Open Font License 授權。</li>
          <li>發音使用瀏覽器內建的語音合成；AI 家教使用 Anthropic 的 Claude API。</li>
        </ul>
      </section>
    </div>
  );
}
