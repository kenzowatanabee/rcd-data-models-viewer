export type SqlTokenKind =
  'keyword' | 'string' | 'comment' | 'number' | 'identifier' | 'plain';

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

/** Keywords and the functions the docs' Domo formulas use. */
const KEYWORDS = new Set(
  `select from where and or not in is null case when then else end as on join
  left right inner outer full cross group by order having limit union all
  distinct like between exists cast coalesce ifnull nullif concat sum avg
  count min max floor mod round substring trim upper lower str_to_date
  date_format with over partition true false asc desc insert update delete
  into values set create table view replace if`
    .split(/\s+/)
    .filter(Boolean),
);

// Order matters: comments and strings before anything they could contain
const TOKEN =
  /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?|"(?:[^"]|"")*"?)|(`[^`\n]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_\u00c0-\u024f][\w\u00c0-\u024f]*)/g;

/**
 * Splits SQL into coloured spans. A tokenizer, not a parser: it only needs
 * to tell keywords, strings, comments, numbers and quoted names apart.
 * Joining the tokens' text gives back the source exactly.
 */
export function highlightSql(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const push = (kind: SqlTokenKind, text: string) => {
    if (text === '') return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === kind && kind === 'plain') last.text += text;
    else tokens.push({ kind, text });
  };
  let last = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(source)) !== null) {
    push('plain', source.slice(last, match.index));
    const [text, comment, string, quoted, number, word] = match;
    if (comment !== undefined) push('comment', text);
    else if (string !== undefined) push('string', text);
    else if (quoted !== undefined) push('identifier', text);
    else if (number !== undefined) push('number', text);
    else if (word !== undefined) {
      push(KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'plain', text);
    }
    last = TOKEN.lastIndex;
  }
  push('plain', source.slice(last));
  return tokens;
}
