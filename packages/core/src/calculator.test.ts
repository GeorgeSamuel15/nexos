import { describe, expect, it } from 'vitest';

import { calculate } from './calculator.js';

describe('calculate', () => {
  it('respects precedence and parentheses', () => {
    expect(calculate('2 + 3 * (4 - 1)')).toBe(11);
  });

  it('supports exponentiation and unary negatives', () => {
    expect(calculate('-2 + 3 ^ 2')).toBe(7);
  });

  it('rejects arbitrary JavaScript', () => {
    expect(() => calculate('process.exit()')).toThrow(/Unsupported/);
  });
});
