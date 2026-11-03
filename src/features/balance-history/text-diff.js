// Token-level before/after diff for adjustment text. Numbers keep their sign and
// percent so "+80" → "+30" marks the whole value instead of a single digit.
const TOKEN = /[+-]?\d+(?:\.\d+)?%?|[A-Za-z]+|\s+|./gsu;

function commonPairs(left, right) {
  const rows = left.length, cols = right.length;
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let i = rows; i--;) for (let j = cols; j--;) {
    table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const pairs = [];
  for (let i = 0, j = 0; i < rows && j < cols;) {
    if (left[i] === right[j]) pairs.push([i++, j++]);
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

function segments(tokens, kept) {
  const parts = [];
  tokens.forEach((text, index) => {
    const changed = !kept.has(index) && !!text.trim();
    const last = parts[parts.length - 1];
    if (last?.changed === changed) last.text += text;
    else parts.push({ text, changed });
  });
  // Whitespace between two edits joins them into one mark; shared text stays unmarked
  // so both sides agree on what changed.
  for (let index = parts.length - 2; index > 0; index--) {
    const [before, middle, after] = parts.slice(index - 1, index + 2);
    if (before.changed && after.changed && !middle.text.trim()) parts.splice(index - 1, 3, { text: before.text + middle.text + after.text, changed: true });
  }
  return parts;
}

export function diffText(before, after) {
  const left = String(before).match(TOKEN) ?? [], right = String(after).match(TOKEN) ?? [];
  const pairs = left.length * right.length <= 250_000 ? commonPairs(left, right) : [];
  // A rewrite with little in common is clearer unmarked than marked end to end.
  if (pairs.reduce((sum, [i]) => sum + left[i].length, 0) < 0.2 * Math.min(String(before).length, String(after).length) || !pairs.length) {
    return { before: [{ text: String(before), changed: false }], after: [{ text: String(after), changed: false }] };
  }
  return { before: segments(left, new Set(pairs.map(([i]) => i))), after: segments(right, new Set(pairs.map(([, j]) => j))) };
}
