
import { describe, it, expect } from 'vitest';
import { plural } from './plural';

describe('plural function', () => {

  it('handles count 0', () => {
    expect(plural(0, 'cat')).toBe('0 cats');
  });

  it('handles count 1', () => {
    expect(plural(1, 'cat')).toBe('1 cat');
  });

  it('handles count 2 or more', () => {
    expect(plural(2, 'cat')).toBe('2 cats');
    expect(plural(5, 'cat')).toBe('5 cats');
  });

  it('handles custom plural forms', () => {
    expect(plural(3, 'person', 'people')).toBe('3 people');
  });

  it('uses the default plural form', () => {
    expect(plural(4, 'book')).toBe('4 books');
  });

});
