// A line diff for `elgavio check`: the longest common subsequence, which is fine for a types file
// of a few thousand lines.

export interface DiffLine {
  kind: ' ' | '-' | '+';
  text: string;
}

export const diffLines = (before: readonly string[], after: readonly string[]): DiffLine[] => {
  const rows = before.length + 1;
  const cols = after.length + 1;
  const common = new Uint32Array(rows * cols);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      common[i * cols + j] =
        before[i] === after[j]
          ? (common[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(common[(i + 1) * cols + j] ?? 0, common[i * cols + j + 1] ?? 0);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      lines.push({ kind: ' ', text: before[i] ?? '' });
      i += 1;
      j += 1;
    } else if (
      i < before.length &&
      (j === after.length || (common[(i + 1) * cols + j] ?? 0) >= (common[i * cols + j + 1] ?? 0))
    ) {
      lines.push({ kind: '-', text: before[i] ?? '' });
      i += 1;
    } else {
      lines.push({ kind: '+', text: after[j] ?? '' });
      j += 1;
    }
  }
  return lines;
};

/** Only the changed lines, each run with `context` unchanged lines around it. */
export const formatDiff = (lines: readonly DiffLine[], context = 3): string => {
  const shown = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind !== ' ') {
      for (let k = index - context; k <= index + context; k += 1) {
        shown.add(k);
      }
    }
  });
  const out: string[] = [];
  let last = -1;
  lines.forEach((line, index) => {
    if (!shown.has(index)) {
      return;
    }
    if (last !== -1 && index !== last + 1) {
      out.push('  …');
    }
    out.push(`${line.kind} ${line.text}`);
    last = index;
  });
  return out.join('\n');
};
