import { TextWrap } from 'lucide-react';
import { useMemo } from 'react';

import { CopyButton } from './CopyButton';
import { sourceHeadings, sourceLines, tokenizeSource } from './markdownSource';
import { docHash } from './route';

interface Props {
  file: string;
  /** The file exactly as on disk. */
  text: string;
  /** Line from the address, highlighted. */
  line: number | null;
  wrap: boolean;
  onWrap: (wrap: boolean) => void;
}

const sizeOf = (text: string) => {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
};

/**
 * The doc's Markdown as text, front-matter included. Everything goes in as
 * React text nodes, so nothing in the file is ever read as HTML.
 */
export function SourceView({ file, text, line, wrap, onWrap }: Props) {
  const lines = useMemo(() => tokenizeSource(text), [text]);
  const count = useMemo(() => sourceLines(text).length, [text]);
  // Headings carry the rendered page's ids, so outline links land here too
  const anchors = useMemo(
    () => new Map(sourceHeadings(text).map((h) => [h.line, h.id])),
    [text],
  );
  const digits = String(count).length;
  return (
    <section className="source" aria-label="Markdown source">
      <div className="source-toolbar">
        <span className="source-meta tabular">
          {count} {count === 1 ? 'line' : 'lines'} · {sizeOf(text)}
          {text.includes('\r\n') && ' · CRLF'}
        </span>
        <span className="source-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={wrap}
            title={wrap ? 'Stop wrapping long lines' : 'Wrap long lines'}
            onClick={() => onWrap(!wrap)}
          >
            <TextWrap size={13} aria-hidden="true" />
            Wrap
          </button>
          <CopyButton
            text={text}
            label="Copy the whole Markdown file"
            className="source-copy"
          >
            Copy all
          </CopyButton>
        </span>
      </div>
      <div
        className={`source-body${wrap ? ' is-wrapped' : ''}`}
        style={{ ['--ln-digits' as string]: digits }}
        tabIndex={0}
        role="region"
        aria-label={`Markdown of ${file}`}
      >
        {lines.map((tokens, index) => {
          const n = index + 1;
          const anchor = anchors.get(n);
          return (
            <div
              key={n}
              id={`L${n}`}
              className={`src-line${n === line ? ' is-target' : ''}`}
            >
              {anchor !== undefined && (
                <span id={anchor} className="src-anchor" />
              )}
              <a
                className="src-ln"
                href={docHash(file, null, { source: true, line: n })}
                aria-label={`Line ${n}`}
                tabIndex={-1}
              >
                {n}
              </a>
              <span className="src-text">
                {tokens.map((token, at) =>
                  token.kind === 'text' ? (
                    token.text
                  ) : (
                    <span key={at} className={`tk-${token.kind}`}>
                      {token.text}
                    </span>
                  ),
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
