import { describe, it, expect } from 'vitest';
import { pluralize, formatCount } from '../utils/pluralize.js';

describe('pluralize', () => {
  it('uses the singular form for exactly 1', () => {
    expect(pluralize(1, 'key')).toBe('key');
    expect(pluralize(-1, 'key')).toBe('key');
  });

  it('uses the regular plural form (adds "s") for any other count', () => {
    expect(pluralize(0, 'key')).toBe('keys');
    expect(pluralize(2, 'key')).toBe('keys');
    expect(pluralize(30, 'member')).toBe('members');
  });

  it('uses an explicit irregular plural when given one', () => {
    expect(pluralize(1, 'policy', 'policies')).toBe('policy');
    expect(pluralize(2, 'policy', 'policies')).toBe('policies');
    expect(pluralize(0, 'policy', 'policies')).toBe('policies');
  });
});

describe('formatCount', () => {
  it('joins the count and the correctly pluralized noun', () => {
    expect(formatCount(1, 'key')).toBe('1 key');
    expect(formatCount(2, 'key')).toBe('2 keys');
    expect(formatCount(0, 'user')).toBe('0 users');
    expect(formatCount(1, 'policy', 'policies')).toBe('1 policy');
    expect(formatCount(5, 'policy', 'policies')).toBe('5 policies');
  });
});
