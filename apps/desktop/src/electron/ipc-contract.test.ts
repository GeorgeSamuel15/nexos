import { describe, expect, it } from 'vitest';

import { schemas } from './ipc-contract.js';

describe('IPC input validation', () => {
  it('rejects relative filesystem paths', () => {
    expect(() => schemas.filePath.parse('../../etc/passwd')).toThrow();
  });

  it('rejects oversized clipboard data', () => {
    expect(() => schemas.clipboardText.parse('x'.repeat(100_001))).toThrow();
  });

  it('accepts a validated settings patch', () => {
    expect(schemas.settings.parse({ theme: 'light', accent: '#3366ff' })).toEqual({
      theme: 'light',
      accent: '#3366ff',
    });
  });

  it('requires HTTPS registry settings and valid package names', () => {
    expect(() => schemas.settings.parse({ registryUrl: 'http://registry.example.com' })).toThrow();
    expect(schemas.packageName.parse('focus-timer')).toBe('focus-timer');
    expect(() => schemas.packageName.parse('../native-addon')).toThrow();
  });

  it('bounds package-manager command arguments', () => {
    expect(schemas.packageCommand.parse(['search', 'notes'])).toEqual(['search', 'notes']);
    expect(() => schemas.packageCommand.parse(new Array(9).fill('argument'))).toThrow();
  });
});
