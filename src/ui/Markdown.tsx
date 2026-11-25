import { Link as LinkIcon } from 'lucide-react';
import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from 'react-markdown';

import { CodeBlock } from './CodeBlock';
import { useCopy } from './CopyButton';
import { DiagramBlock } from './Diagram';
import { hastText, type HastNode } from './headingIds';
import { resolveLink } from './links';
import { markdownPlugins } from './markdownPipeline';
import { OutlineSink, type OutlineItem } from './outline';
import { docHash } from './route';
import { TableBlock, TableRow, tableCell } from './TableBlock';

type HastElement = NonNullable<ExtraProps['node']>;

/** The ```lang of a code block, from the `<pre>` that holds it. */
function codeOf(
  pre: HastElement | undefined,
): { source: string; language: string | null } | null {
  const code = pre?.children[0];
  if (code?.type !== 'element' || code.tagName !== 'code') return null;
  const classes = code.properties.className;
  const language = Array.isArray(classes)
    ? classes
        .map(String)
        .find((name) => name.startsWith('language-'))
        ?.slice('language-'.length)
    : undefined;
  return {
    source: hastText(code as HastNode),
    language: language ?? null,
  };
}

/** The address of a section, as a full URL to paste elsewhere. */
const sectionUrl = (file: string, id: string) =>
  `${window.location.origin}${window.location.pathname}${docHash(file, id)}`;

function HeadingAnchor({ file, id }: { file: string; id: string }) {
  const [state, copy] = useCopy();
  return (
    <a
      className="heading-anchor"
      href={docHash(file, id)}
      aria-label="Link to this section (copies the address)"
      title="Link to this section (copies the address)"
      onClick={() => copy(sectionUrl(file, id))}
      data-state={state}
    >
      <LinkIcon size={14} aria-hidden="true" />
      {state === 'copied' && <span className="copy-feedback">Copied</span>}
    </a>
  );
}

function heading(Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', file: string) {
  return function Heading({
    id,
    children,
  }: {
    id?: string;
    children?: ReactNode;
  }) {
    return (
      <Tag id={id}>
        {children}
        {id !== undefined && <HeadingAnchor file={file} id={id} />}
      </Tag>
    );
  };
}

function components(file: string): Components {
  return {
    a({ href, children, title, id }) {
      // An allowlisted `<a id>` link target, not a link
      if (href === undefined) return <a id={id}>{children}</a>;
      const target = resolveLink(file, href);
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
    h1: heading('h1', file),
    h2: heading('h2', file),
    h3: heading('h3', file),
    h4: heading('h4', file),
    h5: heading('h5', file),
    h6: heading('h6', file),
    pre({ node, children }) {
      const code = codeOf(node);
      if (code === null) return <pre>{children}</pre>;
      if (code.language === 'mermaid') {
        return <DiagramBlock source={code.source} />;
      }
      return <CodeBlock source={code.source} language={code.language} />;
    },
    table({ node, children }) {
      return (
        <TableBlock node={node as HastNode | undefined}>{children}</TableBlock>
      );
    },
    tr: TableRow,
    td: tableCell('td'),
    th: tableCell('th'),
    img({ src, alt }) {
      if (typeof src === 'string' && /^https?:\/\//i.test(src)) {
        return <img src={src} alt={alt} />;
      }
      return <span className="inert-link">[image: {alt || src}]</span>;
    },
  };
}

interface Props {
  file: string;
  body: string;
  /** The title's text, taken out of the body; keeps heading ids as on GitHub. */
  title?: string | null;
  /** Called with the h2/h3 outline after each render that changes it. */
  onOutline?: (items: OutlineItem[]) => void;
}

/**
 * GitHub-flavoured Markdown with an allowlist of raw HTML (see
 * htmlAllowlist.ts), links resolved against `file`.
 */
export function Markdown({ file, body, title = null, onOutline }: Props) {
  // Stable per file, so re-renders do not remount (and redraw) every diagram
  const overrides = useMemo(() => components(file), [file]);
  // The outline is collected while rendering and handed over after it;
  // the receiver ignores an unchanged outline
  const sink = useMemo(() => new OutlineSink(), []);
  const plugins = useMemo(
    () =>
      markdownPlugins({
        reserved: title === null ? [] : [title],
        collect: sink.collect,
      }),
    [title, sink],
  );
  // Before paint, so the outline column does not pop in a frame late
  useLayoutEffect(() => {
    onOutline?.(sink.items);
  });

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={plugins.remark}
        rehypePlugins={plugins.rehype}
        components={overrides}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
