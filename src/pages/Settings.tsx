import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  NEW_PER_DAY_OPTIONS, settingsStore, updateSettings, usageStore, exportBackup, importBackup, peekBackup, preImportStore, undoImport,
  resetAllProgress, lastExportStore, markExported, type BackupPreview, type BackupSummary, type ThemePref,
} from '../state';
import { useStore } from '../state/store';
import { isRemoteVoice, refreshVoices, useSpeech, speak } from '../lib/speech';
import { estimateCost, modelInfo } from '../lib/claude';
import { daysBetween, formatDateTimeZh } from '../lib/date';
import { usePageTitle } from '../lib/title';
import { googleCalendarUrl, reminderIcs } from '../lib/reminder';
import { ApiKeySetup } from '../components/ApiKeySetup';
import { AppInstall } from '../components/AppInstall';
import { Segmented, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';

/** 匯入前比較備份和目前紀錄的項目 */
const SUMMARY_ROWS: [keyof BackupSummary, string][] = [
  ['lessons', '完成的課'],
  ['kana', '熟悉的假名'],
  ['words', '學過的單字'],
  ['days', '學習天數'],
];

/**
 * 確認列出現、收起來時，剛按的按鈕不見了：焦點放到接下來要用的按鈕（下一個畫面才有那顆按鈕）。
 * 不處理的話焦點掉回頁面最上面，鍵盤和讀螢幕軟體的使用者得從頭找。
 */
function focusSoon(ref: RefObject<HTMLElement | null>) {
  requestAnimationFrame(() => ref.current?.focus());
}

/** 讓瀏覽器下載一個檔案 */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Settings() {
  usePageTitle('設定');
  const settings = useStore(settingsStore);
  const lastExport = useStore(lastExportStore);
  const usage = useStore(usageStore);
  const speech = useSpeech();
  const localVoices = speech.voices.some((v) => !isRemoteVoice(v));
  // 語音清單有時很晚才出來（又不觸發 voiceschanged）：打開設定頁時再讀一次
  useEffect(() => {
    if (!speech.voices.length) refreshVoices();
  }, [speech.voices.length]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'mark'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ name: string; text: string; preview: BackupPreview } | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const preImport = useSyncExternalStore(preImportStore.subscribe, preImportStore.get, preImportStore.get);
  const msgRef = useRef<HTMLParagraphElement>(null);
  // 「清除所有學習紀錄」「復原匯入前的紀錄」和它們確認列的「取消」
  const resetRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const undoCancelRef = useRef<HTMLButtonElement>(null);

  const exportAgo = lastExport ? daysBetween(lastExport, Date.now()) : null;
  const totalCost = Object.entries(usage.byModel).reduce(
    (sum, [m, u]) => sum + estimateCost(m, u.input - u.cacheWrite - u.cacheRead, u.output, u.cacheWrite, u.cacheRead),
    0,
  );

  // 每天提醒：行事曆行程附上這個網站的網址（線上版或本機版都對）
  const reminder = { time: settings.remindAt, url: `${location.origin}${location.pathname}`, now: Date.now() };
  const downloadReminder = () => {
    saveFile(new Blob([reminderIcs(reminder)], { type: 'text/calendar;charset=utf-8' }), 'nihongo-daily-reminder.ics');
  };

  const download = () => {
    const d = new Date();
    saveFile(
      new Blob([exportBackup()], { type: 'application/json' }),
      `nihongo-classroom-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`,
    );
    markExported();
    setMsg({ tone: 'ok', text: '已下載備份檔。到另一台裝置打開這個網站，用「匯入備份」就能接著學。' });
  };

  /** 按鈕不見後焦點放到結果訊息，螢幕閱讀器也會念出來 */
  const report = (next: { tone: 'ok' | 'mark'; text: string }) => {
    setMsg(next);
    requestAnimationFrame(() => msgRef.current?.focus());
  };

  // 選好檔案：先檢查、列出備份的內容和目前的紀錄比較，確定了才匯入
  const onPick = async (f: File | null) => {
    setPendingImport(null);
    setConfirmUndo(false);
    setMsg(null);
    if (!f) return;
    try {
      const text = await f.text();
      setPendingImport({ name: f.name, text, preview: peekBackup(text) });
    } catch (e) {
      report({ tone: 'mark', text: e instanceof Error ? e.message : '讀不到這個檔案。' });
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = () => {
    if (!pendingImport) return;
    try {
      const n = importBackup(pendingImport.text);
      report({ tone: 'ok', text: `匯入完成，還原了 ${n} 類學習紀錄。匯入前的紀錄先留著，匯入錯了可以按下面的「復原」。` });
    } catch (e) {
      report({ tone: 'mark', text: e instanceof Error ? e.message : '匯入失敗。' });
    } finally {
      setPendingImport(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const cancelImport = () => {
    setPendingImport(null);
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.focus();
    }
  };

  const doUndo = () => {
    try {
      undoImport();
      report({ tone: 'ok', text: '已經換回匯入前的紀錄。' });
    } catch (e) {
      report({ tone: 'mark', text: e instanceof Error ? e.message : '復原失敗。' });
    } finally {
      setConfirmUndo(false);
    }
  };

  const fewer = pendingImport ? SUMMARY_ROWS.some(([k]) => pendingImport.preview.backup[k] < pendingImport.preview.current[k]) : false;

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
                {isRemoteVoice(v) ? `${v.name}（需要網路）` : v.name}
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
              ? `找到 ${speech.voices.length} 個日文語音。Edge 的「Nanami」和 Chrome 的「Google 日本語」比較自然，但要連網路；${
                  localVoices
                    ? '離線或連不到時，會自動改用電腦內建的日文語音。'
                    : '這台裝置沒有內建的日文語音，離線時會聽不到。Windows 請到「設定 → 時間與語言 → 語音 → 新增語音」加入日文。'
                }`
              : '還沒有找到日文語音。Windows 請到「設定 → 時間與語言 → 語音 → 新增語音」加入日文；Mac 請到「系統設定 → 輔助使用 → 朗讀內容 → 系統語音 → 管理語音」加入日文。也可以改用 Edge 瀏覽器，它內建日文語音。'}
        </p>
        {speech.remoteFailed && localVoices ? (
          <p className="small">線上語音剛剛念不出來（可能沒有網路，或連不到語音服務），這次先用電腦內建的日文語音。</p>
        ) : null}
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

      <section className="block" aria-labelledby="h-remind">
        <h2 id="h-remind">每天提醒</h2>
        <p>
          選一個每天固定學日文的時間，加到行事曆，時間到了手機會提醒你。會建立一個每天重複、20 分鐘的「日文自學」行程，附上這個網站的連結；不想要了，到行事曆刪掉這個行程就好。
        </p>
        <div className="btn-row">
          <label className="inline-select" htmlFor="remind-time">
            時間
            <input
              id="remind-time"
              type="time"
              value={settings.remindAt}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value)) updateSettings({ remindAt: e.target.value });
              }}
            />
          </label>
          <a className="btn btn-primary" href={googleCalendarUrl(reminder)} target="_blank" rel="noopener noreferrer">
            加到 Google 行事曆
          </a>
          <button type="button" className="btn" onClick={downloadReminder}>
            下載行事曆檔（iPhone、Outlook）
          </button>
        </div>
        <p className="small">要改時間的話，先到行事曆刪掉原本的行程，再用新的時間加一次。</p>
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

      <section className="block" aria-labelledby="h-app">
        <h2 id="h-app">App 與離線使用</h2>
        <AppInstall />
      </section>

      <section className="block" aria-labelledby="h-data">
        <h2 id="h-data">學習紀錄</h2>
        <p>課程進度、假名測驗、手寫、單字卡紀錄都只存在這個瀏覽器。換電腦或換瀏覽器前，先匯出備份；平常也建議每兩週匯出一次，清除瀏覽資料時才不會全部不見。</p>
        <p className="small">
          {exportAgo === null
            ? '這個瀏覽器還沒有匯出過備份。'
            : `上次匯出：${new Date(lastExport).toLocaleDateString('zh-TW')}（${exportAgo === 0 ? '今天' : `${exportAgo} 天前`}）`}
        </p>
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
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          />
          <label className="btn" htmlFor="import-file">
            匯入備份
          </label>
        </div>
        {pendingImport ? (
          <div className="confirm-row import-confirm" role="alert">
            <p>
              要匯入「{pendingImport.name}」嗎？備份裡的紀錄會取代這個瀏覽器目前的紀錄。
              {pendingImport.preview.exportedAt
                ? `這個備份是 ${formatDateTimeZh(pendingImport.preview.exportedAt)} 匯出的。`
                : '這個備份沒有記錄匯出的時間。'}
            </p>
            <table className="import-cmp">
              <thead>
                <tr>
                  <td />
                  <th scope="col">備份檔</th>
                  <th scope="col">這個瀏覽器</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_ROWS.map(([k, label]) => (
                  <tr key={k}>
                    <th scope="row">{label}</th>
                    <td className={pendingImport.preview.backup[k] < pendingImport.preview.current[k] ? 'is-less' : undefined}>
                      {pendingImport.preview.backup[k]}
                    </td>
                    <td>{pendingImport.preview.current[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fewer ? <p className="import-warn">備份裡有些紀錄比這個瀏覽器少：匯入後，少掉的部分會不見。</p> : null}
            <p className="small">匯入前會先把目前的紀錄留一份，匯入錯了可以復原。</p>
            <div className="btn-row">
              <button type="button" className="btn btn-sm btn-primary" onClick={doImport}>
                匯入
              </button>
              <button type="button" className="linkbtn" onClick={cancelImport}>
                取消
              </button>
            </div>
          </div>
        ) : null}
        {/* 一直留著的播報區（沒有訊息時藏起來）：焦點沒有移到這裡時（例如全部清除後回到按鈕），結果也會念出來 */}
        <p ref={msgRef} tabIndex={-1} className={msg ? `key-status tone-${msg.tone}` : 'sr-only'} role="status">
          {msg?.text}
        </p>
        {preImport && !pendingImport ? (
          <div className="reset-row">
            {confirmUndo ? (
              <>
                <span>換回 {formatDateTimeZh(preImport.at)} 匯入前的紀錄嗎？匯入之後新學的會不見。</span>
                <button type="button" className="btn btn-sm btn-primary" onClick={doUndo}>
                  復原
                </button>
                <button
                  type="button"
                  className="linkbtn"
                  ref={undoCancelRef}
                  onClick={() => {
                    setConfirmUndo(false);
                    focusSoon(undoRef);
                  }}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                className="linkbtn"
                ref={undoRef}
                onClick={() => {
                  setConfirmUndo(true);
                  // 先停在「取消」：連按兩下 Enter 不會直接換掉紀錄
                  focusSoon(undoCancelRef);
                }}
              >
                復原 {formatDateTimeZh(preImport.at)} 匯入前的紀錄
              </button>
            )}
          </div>
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
                  // 結果由上面的播報區念出來；焦點回到原本的按鈕
                  setMsg({ tone: 'ok', text: '已清除所有學習紀錄。' });
                  focusSoon(resetRef);
                }}
              >
                全部清除
              </button>
              <button
                type="button"
                className="linkbtn"
                ref={resetCancelRef}
                onClick={() => {
                  setConfirmReset(false);
                  focusSoon(resetRef);
                }}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="linkbtn danger"
              ref={resetRef}
              onClick={() => {
                setConfirmReset(true);
                // 先停在「取消」：連按兩下 Enter 不會直接清掉紀錄
                focusSoon(resetCancelRef);
              }}
            >
              清除所有學習紀錄
            </button>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="h-about">
        <h2 id="h-about">關於</h2>
        <ul className="facts">
          <li>
            筆順資料（含網站圖示的「あ」）：
            <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener noreferrer">
              KanjiVG
            </a>
            ，© Ulrich Apel，以{' '}
            <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">
              CC BY-SA 3.0
            </a>{' '}
            授權。
          </li>
          <li>
            字型：Klee One、LXGW WenKai TC（只保留網站用到的字，下載量小很多），皆以 SIL Open Font License 1.1 授權（
            <a href="./FONT-LICENSES.txt" target="_blank" rel="noopener">
              授權全文
            </a>
            ）；內文使用系統字型。
          </li>
          <li>
            程式碼以 MIT 授權公開在{' '}
            <a href="https://github.com/willisXu/nihongo-classroom" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            ；使用到的開源套件授權見
            <a href="./THIRD-PARTY-LICENSES.md" target="_blank" rel="noopener">
              開源授權清單
            </a>
            。
          </li>
          <li>發音使用瀏覽器內建的語音合成；AI 家教使用 Anthropic 的 Claude API。</li>
        </ul>
      </section>
    </div>
  );
}
