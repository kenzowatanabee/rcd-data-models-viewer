/** Layers with their own colour; anything else gets the grey marker. */
const LAYERS = new Set(['source', 'dimension', 'intermediate', 'output']);

export type StatusTone = 'draft' | 'reviewed' | 'other';

export interface DocHeaderModel {
  kind: 'dataset' | 'pipeline' | null;
  layer: { name: string; className: string } | null;
  status: { label: string; tone: StatusTone } | null;
  /** Datasets: what one row is. The most useful single fact. */
  grain: string | null;
  /** Secondary facts, in display order. */
  facts: { label: string; value: string; mono: boolean }[];
  aliases: string[];
}

/** YAML reads a bare 2026-10-21 as a date and numbers as numbers. */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) {
    const joined = value.map(text).filter(Boolean).join(', ');
    return joined === '' ? null : joined;
  }
  if (typeof value === 'object') return null;
  const result = String(value).trim();
  return result === '' ? null : result;
}

function list(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map(text).filter((item): item is string => item !== null);
}

export function toneOf(status: string): StatusTone {
  const lower = status.toLowerCase();
  if (lower === 'draft') return 'draft';
  if (['reviewed', 'verified', 'approved', 'final'].includes(lower)) {
    return 'reviewed';
  }
  return 'other';
}

/** What the doc header shows, from the front-matter. */
export function docHeader(
  data: Record<string, unknown> | null,
): DocHeaderModel {
  if (data === null) {
    return {
      kind: null,
      layer: null,
      status: null,
      grain: null,
      facts: [],
      aliases: [],
    };
  }
  const type = text(data.type);
  const kind = type === 'dataset' || type === 'pipeline' ? type : null;
  const layerName = text(data.layer);
  const status = text(data.status);
  const facts: DocHeaderModel['facts'] = [];
  const add = (label: string, value: unknown, mono = false) => {
    const shown = text(value);
    if (shown !== null) facts.push({ label, value: shown, mono });
  };
  add('Platform', data.platform);
  add('Domo id', data.domo_id, true);
  add('Updated', data.last_updated);
  const name = text(data.name);
  return {
    kind,
    layer:
      layerName === null
        ? null
        : {
            name: layerName,
            className: `layer-${LAYERS.has(layerName) ? layerName : 'other'}`,
          },
    status: status === null ? null : { label: status, tone: toneOf(status) },
    grain: text(data.grain),
    facts,
    // The name itself is the title; an alias equal to it adds nothing
    aliases: list(data.aliases).filter((alias) => alias !== name),
  };
}

/** `[NAME](path.md)`, with brackets in the name escaped. */
export const markdownLink = (name: string, file: string) =>
  `[${name.replace(/([[\]\\])/g, '\\$1')}](${file.replace(/ /g, '%20')})`;
