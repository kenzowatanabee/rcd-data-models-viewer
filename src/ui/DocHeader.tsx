import { CircleCheck, PencilLine, Waypoints } from 'lucide-react';
import type { Ref } from 'react';

import { CopyButton } from './CopyButton';
import type { DocHeaderModel } from './docHeaderModel';
import { inlineParts } from './outline';
import { graphHash } from './route';

interface Props {
  file: string;
  /** The doc's `# Title` as written (Markdown inline), or null. */
  title: string | null;
  /** The id the title has on GitHub, so `#title` links still land. */
  titleId: string | null;
  model: DocHeaderModel;
  /** Graph node id, for "Show in graph"; null for docs outside the graph. */
  graphNode: string | null;
  frontMatterError: string | null;
  titleRef?: Ref<HTMLHeadingElement>;
}

function Title({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, index) =>
        part.code ? (
          <code key={index}>{part.text}</code>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

const KIND_LABEL = { dataset: 'Dataset', pipeline: 'Pipeline' } as const;

/** Title, kind/layer/status badges, key facts and the file path. */
export function DocHeader({
  file,
  title,
  titleId,
  model,
  graphNode,
  frontMatterError,
  titleRef,
}: Props) {
  const hasBadges =
    model.kind !== null || model.layer !== null || model.status !== null;
  const fileName = file.slice(file.lastIndexOf('/') + 1);
  return (
    <header className="doc-header">
      {(hasBadges || graphNode !== null) && (
        <div className="doc-header-top">
          {hasBadges && (
            <ul className="doc-badges" aria-label="Doc properties">
              {model.kind !== null && (
                <li className={`badge badge-kind kind-${model.kind}`}>
                  {model.kind === 'pipeline' && (
                    <span
                      className="layer-marker kind-pipeline"
                      aria-hidden="true"
                    />
                  )}
                  {KIND_LABEL[model.kind]}
                </li>
              )}
              {model.layer !== null && (
                <li className="badge badge-layer" title="Layer">
                  <span
                    className={`layer-marker ${model.layer.className}`}
                    aria-hidden="true"
                  />
                  <span className="visually-hidden">Layer: </span>
                  {model.layer.name}
                </li>
              )}
              {model.status !== null && (
                <li
                  className={`badge badge-status status-${model.status.tone}`}
                  title="Status"
                >
                  {model.status.tone === 'reviewed' ? (
                    <CircleCheck size={12} aria-hidden="true" />
                  ) : model.status.tone === 'draft' ? (
                    <PencilLine size={12} aria-hidden="true" />
                  ) : null}
                  <span className="visually-hidden">Status: </span>
                  {model.status.label}
                </li>
              )}
            </ul>
          )}
          {graphNode !== null && (
            <a
              className="btn btn-sm doc-graph-link"
              href={graphHash({ focus: graphNode, node: graphNode })}
            >
              <Waypoints size={14} aria-hidden="true" />
              Show in graph
            </a>
          )}
        </div>
      )}
      <h1
        className="doc-title"
        id={titleId ?? undefined}
        ref={titleRef}
        tabIndex={-1}
      >
        {title === null ? fileName : <Title text={title} />}
      </h1>
      {model.grain !== null && (
        <p className="doc-grain">
          <span className="doc-grain-label">Grain</span>
          <span>{model.grain}</span>
        </p>
      )}
      <dl className="doc-facts">
        {model.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd className={fact.mono ? 'mono' : undefined}>{fact.value}</dd>
          </div>
        ))}
        {model.aliases.length > 0 && (
          <div className="doc-aliases">
            <dt>Also known as</dt>
            <dd>
              {model.aliases.map((alias) => (
                <code key={alias}>{alias}</code>
              ))}
            </dd>
          </div>
        )}
        <div className="doc-file">
          <dt>File</dt>
          <dd>
            <code title={file}>{file}</code>
            <CopyButton text={file} label="Copy the file path" />
          </dd>
        </div>
      </dl>
      {frontMatterError !== null && (
        <p className="error">
          Front-matter could not be read: {frontMatterError}
        </p>
      )}
    </header>
  );
}
