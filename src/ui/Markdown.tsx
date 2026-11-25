import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { rehypeHeadingIds } from './headingIds';
import { resolveLink } from './links';
import { renderMermaid, type DiagramResult } from './mermaid';
import { docHash } from './route';

type HastElement = NonNullable<ExtraProps['node']>;
type HastChild = HastElement['children'][number];

function textOf(node: HastChild): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

/** The source of a ```mermaid block, from the `<pre>` that holds it. */
function mermaidSource(pre: HastElement | undefined): string | null {
  const code = pre?.children[0];
  if (code?.type !== 'element' || code.tagName !== 'code') return null;
  const classes = code.properties.className;
  if (!Array.isArray(classes) || !classes.includes('language-mermaid')) {
    return null;
  }
  return code.children.map(textOf).join('');
}

function MermaidBlock({ source }: { source: string }) {
  const [result, setResult] = useState<DiagramResult | null>(null);
  const [fit, setFit] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void renderMermaid(source).then((rendered) => {
      if (!cancelled) setResult(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (result === null) {
    return <div className="mermaid-pending">Rendering diagram…</div>;
  }
  if ('error' in result) {
    return (
      <div className="mermaid-error">
        <p>
          <strong>This diagram could not be rendered.</strong>
        </p>
        {/* Parser errors point at a column, so keep their line breaks */}
        <pre className="mermaid-message">{result.error}</pre>
        <p>Source:</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }
  return (
    <figure className="mermaid">
      <button
        type="button"
        className="diagram-toggle"
        onClick={() => setFit((value) => !value)}
      >
        {fit ? 'Actual size' : 'Fit to width'}
      </button>
      <div
        className={fit ? 'mermaid-diagram fit' : 'mermaid-diagram'}
        // mermaid's output, sanitised by mermaid itself in strict mode
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
    </figure>
  );
}

function components(file: string): Components {
  return {
    a({ href, children, title }) {
      const target = resolveLink(file, href ?? '');
      switch (target.kind) {
        case 'doc':
          return (
            <a href={docHash(target.file, target.anchor)} title={title}>
              {children}
            </a>
          );
        case 'anchor':
          return (
            <a href={docHash(file, target.anchor)} title={title}>
              {children}
            </a>
          );
        case 'external':
          return (
            <a
              href={target.href}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
              className="external-link"
            >
              {children}
            </a>
          );
        case 'repo-file':
          return (
            <span
              className="inert-link"
              title={`${target.file} is not a Markdown doc; open it in the repo`}
            >
              {children}
            </span>
          );
        case 'inert':
          return (
            <span
              className="inert-link"
              title={`Link not followed: ${target.href}`}
            >
              {children}
            </span>
          );
      }
    },
    pre({ node, children }) {
      const source = mermaidSource(node);
      if (source !== null) return <MermaidBlock source={source} />;
      return <pre>{children}</pre>;
    },
    table({ children }) {
      return (
        <div className="table-scroll">
          <table>{children}</table>
        </div>
      );
    },
    img({ src, alt }) {
      if (typeof src === 'string' && /^https?:\/\//i.test(src)) {
        return <img src={src} alt={alt} />;
      }
      return <span className="inert-link">[image: {alt || src}]</span>;
    },
  };
}

/** GitHub-flavoured Markdown, no raw HTML, links resolved against `file`. */
export function Markdown({ file, body }: { file: string; body: string }) {
  // Stable per file, so re-renders do not remount (and redraw) every diagram
  const overrides = useMemo(() => components(file), [file]);
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHeadingIds]}
        components={overrides}
        // Raw HTML is not rendered; the docs only use it for <details>, whose
        // content is plain Markdown and still shows
        skipHtml
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
