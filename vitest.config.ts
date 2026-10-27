import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 測試檔共用 worker，不每個檔重開一個（全部測試快約 4 秒）。
    // 共用時，一個檔改掉的全域變數、環境變數、mock 不能留給下一個檔：每個測試開始前都還原。
    // 測試的模組狀態（例如 src/state 的紀錄）各檔自己清（backup.test.ts 的 resetAllProgress）；打亂檔案順序跑過確認不互相影響
    isolate: false,
    unstubGlobals: true,
    unstubEnvs: true,
    restoreMocks: true,
  },
});
