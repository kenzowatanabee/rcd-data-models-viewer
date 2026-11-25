import { parse as parseYaml } from 'yaml';

export interface SplitDoc {
  /** Parsed front-matter; null when there is none or it is not a mapping. */
  data: Record<string, unknown> | null;
  /** Why the front-matter could not be read, when it could not. */
  error: string | null;
  body: string;
}

/** Same delimiters as the indexer: optional BOM, `---` lines, LF or CRLF. */
const FRONT_MATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function splitFrontMatter(text: string): SplitDoc {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: null, error: null, body: text };
  const body = text.slice(match[0].length);
  try {
    const parsed: unknown = parseYaml(match[1] ?? '');
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return { data: null, error: 'front-matter is not a mapping', body };
    }
    return { data: parsed as Record<string, unknown>, error: null, body };
  } catch (error) {
    const message = (error as Error).message.split('\n')[0] ?? '';
    return { data: null, error: message, body };
  }
}

const HEADER_FIELDS: [key: string, label: string][] = [
  ['type', 'Kind'],
  ['layer', 'Layer'],
  ['platform', 'Platform'],
  ['status', 'Status'],
  ['last_updated', 'Last updated'],
  ['domo_id', 'Domo id'],
];

/** The front-matter fields worth showing above a doc, in a fixed order. */
export function headerFields(
  data: Record<string, unknown> | null,
): { label: string; value: string }[] {
  if (data === null) return [];
  const fields: { label: string; value: string }[] = [];
  for (const [key, label] of HEADER_FIELDS) {
    const value = data[key];
    if (value === null || value === undefined || value === '') continue;
    // YAML reads a bare 2026-10-21 as a date
    const text =
      value instanceof Date
        ? value.toISOString().slice(0, 10)
        : Array.isArray(value)
          ? value.map(String).join(', ')
          : String(value);
    fields.push({ label, value: text });
  }
  return fields;
}
