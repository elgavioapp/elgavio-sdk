import { describe, expect, it } from 'vitest';
import { diffLines, formatDiff } from './diff.js';

describe('formatDiff', () => {
  it('shows each change with its context, removals first', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const after = ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(formatDiff(diffLines(before, after), 1)).toBe(
      ['  a', '- b', '+ B', '  c', '  …', '  i', '+ j'].join('\n'),
    );
  });

  it('is empty for equal texts', () => {
    expect(formatDiff(diffLines(['a'], ['a']))).toBe('');
  });
});
