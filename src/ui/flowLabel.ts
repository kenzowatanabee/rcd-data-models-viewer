/**
 * Labels in Mermaid flowcharts: text with `<br>`, `<i>`/`<em>`, `<b>`/
 * `<strong>`, HTML entities and Mermaid's `#name;` / `#123;` codes. Parsed
 * into lines of styled runs, so they can be drawn as React elements and
 * never as HTML.
 */

export interface Run {
  text: string;
  italic: boolean;
  bold: boolean;
}

/** One line of a label; `<br>` separates lines. */
export type LabelLine = Run[];

export type LabelParse =
  | {
      ok: true;
      lines: LabelLine[];
      /** Tags other than br/i/em/b/strong, kept as literal text. */
      literalTags: string[];
    }
  | { ok: false; reason: string };

/** Named entities a label may use; anything else is reported, not guessed. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  le: '≤',
  ge: '≥',
  ne: '≠',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  rArr: '⇒',
  lArr: '⇐',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  sect: '§',
  para: '¶',
  check: '✓',
};

function codePoint(value: number): string | null {
  if (!Number.isInteger(value) || value <= 0 || value > 0x10ffff) return null;
  return String.fromCodePoint(value);
}

/** The character an entity name stands for, or null if not known. */
function entity(name: string): string | null {
  if (/^#\d+$/.test(name)) return codePoint(Number(name.slice(1)));
  if (/^#x[0-9a-f]+$/i.test(name)) {
    return codePoint(parseInt(name.slice(2), 16));
  }
  return ENTITIES[name] ?? null;
}

const TAG = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/;
const HTML_ENTITY = /^&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;
// Mermaid's own codes, for characters its syntax reserves: #quot; or #35;
const MERMAID_CODE = /^#(\w+);/;

/**
 * Parses a label's text (quotes already removed). Whitespace collapses as
 * it would in HTML; tags the viewer does not draw stay visible as text.
 */
export function parseLabel(raw: string): LabelParse {
  const lines: LabelLine[] = [[]];
  const literalTags: string[] = [];
  let italic = 0;
  let bold = 0;
  let text = '';

  const flush = () => {
    if (text === '') return;
    const line = lines[lines.length - 1] as LabelLine;
    const style = { italic: italic > 0, bold: bold > 0 };
    const last = line[line.length - 1];
    if (last && last.italic === style.italic && last.bold === style.bold) {
      last.text += text;
    } else {
      line.push({ text, ...style });
    }
    text = '';
  };

  let i = 0;
  while (i < raw.length) {
    const rest = raw.slice(i);
    const char = raw[i] as string;
    if (char === '<') {
      const tag = TAG.exec(rest);
      if (tag !== null) {
        const closing = tag[1] === '/';
        const name = (tag[2] as string).toLowerCase();
        i += tag[0].length;
        if (name === 'br') {
          flush();
          lines.push([]);
        } else if (name === 'i' || name === 'em') {
          flush();
          italic = closing ? Math.max(0, italic - 1) : italic + 1;
        } else if (name === 'b' || name === 'strong') {
          flush();
          bold = closing ? Math.max(0, bold - 1) : bold + 1;
        } else {
          literalTags.push(tag[0]);
          text += tag[0];
        }
        continue;
      }
    } else if (char === '&') {
      const match = HTML_ENTITY.exec(rest);
      if (match !== null) {
        const decoded = entity(match[1] as string);
        if (decoded === null) {
          return { ok: false, reason: `unknown entity ${match[0]}` };
        }
        text += decoded;
        i += match[0].length;
        continue;
      }
    } else if (char === '#') {
      const match = MERMAID_CODE.exec(rest);
      if (match !== null) {
        const name = match[1] as string;
        const decoded = /^\d+$/.test(name) ? entity(`#${name}`) : entity(name);
        if (decoded === null) {
          return { ok: false, reason: `unknown entity code ${match[0]}` };
        }
        text += decoded;
        i += match[0].length;
        continue;
      }
    }
    text += char;
    i += 1;
  }
  flush();
  return { ok: true, lines: lines.map(collapse), literalTags };
}

/** HTML-style whitespace: runs of it become one space, none at the ends. */
function collapse(line: LabelLine): LabelLine {
  const out: LabelLine = [];
  let spaceBefore = false;
  for (const run of line) {
    let text = run.text.replace(/[ \t\r\n\f]+/g, ' ');
    if (spaceBefore || out.length === 0) text = text.replace(/^ /, '');
    if (text === '') continue;
    spaceBefore = text.endsWith(' ');
    out.push({ ...run, text });
  }
  const last = out[out.length - 1];
  if (last !== undefined) {
    last.text = last.text.replace(/ $/, '');
    if (last.text === '') out.pop();
  }
  return out;
}

/** The label's text, lines joined by `\n`, without styling. */
export function plainText(lines: LabelLine[]): string {
  return lines.map((line) => line.map((run) => run.text).join('')).join('\n');
}

/** A label of one plain line, as for a node declared without text. */
export const plainLabel = (text: string): LabelLine[] => [
  [{ text, italic: false, bold: false }],
];
