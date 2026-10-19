/**
 * npm 安裝完成時（package.json 的 postinstall）寫入安裝印記。
 * 自己在命令列跑過 npm ci、npm install 之後，雙擊啟動檔也認得套件已經裝好，
 * 不會把裝好的套件刪掉重裝（見 start-lib.mjs 的 depsInstalled）。
 */
import { fileURLToPath } from 'node:url';
import { writeStamp } from './start-lib.mjs';

try {
  writeStamp(fileURLToPath(new URL('..', import.meta.url)));
} catch {
  // 寫不進去也不影響這次安裝：下次雙擊啟動檔時會重新安裝一次
}
