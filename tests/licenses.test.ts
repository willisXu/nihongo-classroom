import { describe, expect, it } from 'vitest';
import { addMissingLicenses, MISSING_LICENSES } from '../scripts/nk-licenses.mjs';

describe('網站附的第三方授權', () => {
  const md = [
    '# Licenses',
    '',
    '## react - 19.3.0 (MIT)',
    '',
    'MIT License',
    '',
    'Copyright (c) Meta Platforms, Inc. and affiliates.',
    '',
    '## standardwebhooks - 1.1.1 (MIT)',
    '',
    '## svg-path-properties - 2.1.0 (ISC)',
    '',
    'ISC text',
    '',
  ].join('\n');

  it('套件沒附授權檔、清單裡只有標題的，補上全文；其他的不動', () => {
    const out = addMissingLicenses(md);
    expect(out).toContain(`## standardwebhooks - 1.1.1 (MIT)\n\n${MISSING_LICENSES.standardwebhooks}\n\n## svg-path-properties`);
    expect(out).toMatch(/Copyright \(c\) 2023 Svix/);
    expect(out.replace(`\n${MISSING_LICENSES.standardwebhooks}\n`, '')).toBe(md);
    // 再跑一次不會重複加；已經有全文的不動
    expect(addMissingLicenses(out)).toBe(out);
  });

  it('清單最後一個套件也補得到；清單裡沒有這個套件就不動', () => {
    const last = '# Licenses\n\n## standardwebhooks - 1.1.1 (MIT)\n';
    expect(addMissingLicenses(last)).toContain('Copyright (c) 2023 Svix');
    expect(addMissingLicenses('# Licenses\n')).toBe('# Licenses\n');
  });
});
