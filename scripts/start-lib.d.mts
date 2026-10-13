// start-lib.mjs 的型別宣告（給 tests/start.test.ts 型別檢查用）

export declare const PORT: number;
export declare const APP_NAME: string;
export declare const MIN_NODE: Readonly<{ major: number; minor: number }>;
export declare const STAMP_NAME: string;

export interface NodeVersion {
  major: number;
  minor: number;
  patch: number;
}
export declare function parseNodeVersion(version: string): NodeVersion | null;
export declare function isSupportedNode(version: string, min?: { major: number; minor: number }): boolean;

export declare function looksLikeThisApp(html: string): boolean;
export declare function isListening(port: number, host: string, timeoutMs?: number): Promise<boolean>;
export declare function fetchHomePage(port: number, host: string, timeoutMs?: number): Promise<string>;
export type PortState = 'free' | 'app' | 'other';
export declare function checkPort(port: number, options?: { connectTimeoutMs?: number; httpTimeoutMs?: number }): Promise<PortState>;

export declare function expectedStamp(root: string, platform?: string, arch?: string): string;
export declare function depsInstalled(root: string): boolean;
export declare function writeStamp(root: string): void;
export declare function removeStamp(root: string): void;
export declare function runNpmCi(root: string): Promise<boolean>;

export declare const LOCK_NAME: string;
export declare const LOCK_HEARTBEAT_MS: number;
export declare const LOCK_STALE_MS: number;
export declare function processAlive(pid: number): boolean;
export declare function acquireLock(root: string, pid?: number, now?: number): boolean;
export declare function keepLock(root: string): () => void;
export declare function releaseLock(root: string, pid?: number): void;

export declare function browserCommand(url: string, platform?: string): { command: string; args: string[] };
export declare function openBrowser(url: string): boolean;
