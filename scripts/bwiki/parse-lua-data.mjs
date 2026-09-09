// 只读取 return 后的纯数据表；不执行远端 Lua，也不接受函数或表达式。
export function parseLuaData(source) {
  let position = 0;
  const skip = () => {
    while (true) {
      const match = /^(?:\s+|--[^\n]*(?:\n|$))/.exec(source.slice(position));
      if (!match) return;
      position += match[0].length;
    }
  };
  const take = text => { skip(); if (source.slice(position, position + text.length) !== text) throw new Error(`Lua 数据格式不支持：${position}`); position += text.length; };
  function value() {
    skip();
    if (source[position] === '{') {
      take('{');
      const entries = []; let keyed = false; let index = 1;
      while (true) {
        skip(); if (source[position] === '}') { position++; break; }
        let key;
        const identifier = /^([A-Za-z_][\w]*)\s*=/.exec(source.slice(position));
        if (identifier) { key = identifier[1]; position += identifier[0].length; keyed = true; }
        else if (source[position] === '[') { position++; key = value(); take(']'); take('='); keyed = true; }
        else key = index++;
        entries.push([key, value()]);
        skip(); if (source[position] === ',' || source[position] === ';') position++;
        else if (source[position] !== '}') throw new Error(`Lua 表分隔符异常：${position}`);
      }
      return keyed ? Object.fromEntries(entries) : entries.map(([, entry]) => entry);
    }
    if (source[position] === '"') {
      const match = /^"(?:[^"\\]|\\.)*"/s.exec(source.slice(position));
      if (!match) throw new Error('Lua 字符串未闭合');
      position += match[0].length;
      return JSON.parse(match[0]);
    }
    const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true\b|false\b|nil\b)/.exec(source.slice(position));
    if (!literal) throw new Error(`禁止非数据 Lua：${source.slice(position, position + 40)}`);
    position += literal[0].length;
    return literal[0] === 'nil' ? null : JSON.parse(literal[0]);
  }
  take('return'); const result = value(); skip();
  if (position !== source.length) throw new Error('Lua 数据后存在额外表达式');
  return result;
}
