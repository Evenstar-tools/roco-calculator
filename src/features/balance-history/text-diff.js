// Token-level before/after diff for adjustment text. Numbers keep their sign and
// percent so "+80" → "+30" marks the whole value instead of a single digit.
const TOKEN = /[+-]?\d+(?:\.\d+)?%?|[A-Za-z]+|\s+|./gsu;
const MAX_CELLS = 250_000;
const MIN_SHARED = 0.2;

const tokenize = (text) => String(text ?? "").match(TOKEN) ?? [];
const isBlank = (token) => !token.trim();

function commonPairs(left, right) {
  const rows = left.length, cols = right.length;
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0, j = 0; i < rows && j < cols;) {
    if (left[i] === right[j]) pairs.push([i++, j++]);
    else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

// A lone shared character between two edits ("提升" → "降低" sharing "的") reads
// as noise; fold it into the surrounding change on both sides.
function dropIsolated(pairs, left, right) {
  return pairs.filter(([i, j], index) => {
    const previous = pairs[index - 1], next = pairs[index + 1];
    const joinedBefore = previous && previous[0] === i - 1 && previous[1] === j - 1;
    const joinedAfter = next && next[0] === i + 1 && next[1] === j + 1;
    if (joinedBefore || joinedAfter || isBlank(left[i]) || left[i].length > 1) return true;
    const editedBefore = (previous ? i - previous[0] > 1 || j - previous[1] > 1 : i > 0 || j > 0);
    const editedAfter = (next ? next[0] - i > 1 || next[1] - j > 1 : i < left.length - 1 || j < right.length - 1);
    return !(editedBefore && editedAfter);
  });
}

function segments(tokens, kept) {
  const changedAt = (index) => !kept.has(index) && !isBlank(tokens[index]);
  const parts = [];
  tokens.forEach((token, index) => {
    // Whitespace between two changed tokens stays inside one mark.
    let changed = changedAt(index);
    if (isBlank(token) && !kept.has(index)) {
      let next = index + 1;
      while (next < tokens.length && isBlank(tokens[next]) && !kept.has(next)) next += 1;
      changed = index > 0 && changedAt(index - 1) && next < tokens.length && changedAt(next);
    }
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) last.text += token;
    else parts.push({ text: token, changed });
  });
  return parts;
}

const plain = (text) => [{ text: String(text ?? ""), changed: false }];

export function diffText(before, after) {
  const left = tokenize(before), right = tokenize(after);
  if (!left.length || !right.length || left.length * right.length > MAX_CELLS) return { before: plain(before), after: plain(after) };
  const pairs = dropIsolated(commonPairs(left, right), left, right);
  const shared = pairs.reduce((sum, [i]) => sum + left[i].length, 0);
  // A rewrite with little in common is clearer unmarked than marked end to end.
  if (shared < MIN_SHARED * Math.min(String(before).length, String(after).length)) return { before: plain(before), after: plain(after) };
  return {
    before: segments(left, new Set(pairs.map(([i]) => i))),
    after: segments(right, new Set(pairs.map(([, j]) => j))),
  };
}
