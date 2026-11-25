import { useState } from 'react';

import type { GraphNode } from '../indexer/types';
import type { GraphResponse } from '../server/api';
import { matchesFilter } from './filter';
import { docHash } from './route';

interface Item {
  file: string;
  label: string;
  title: string;
  badge: string | null;
}

function Group({
  title,
  items,
  total,
  current,
}: {
  title: string;
  items: Item[];
  total: number;
  current: string | null;
}) {
  return (
    <section className="nav-group">
      <h2>
        {title}{' '}
        <span className="count">
          {items.length === total ? total : `${items.length} / ${total}`}
        </span>
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.file}>
            <a
              href={docHash(item.file)}
              title={item.title}
              aria-current={item.file === current ? 'page' : undefined}
            >
              <span className="nav-label">{item.label}</span>
              {item.badge !== null && <span className="tag">{item.badge}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

const byLabel = (a: Item, b: Item) => a.label.localeCompare(b.label);

function nodeItems(nodes: GraphNode[], query: string, withLayer: boolean) {
  const all = nodes
    .filter((node): node is GraphNode & { file: string } => node.file !== null)
    .map((node) => ({
      file: node.file,
      label: node.name,
      title: [node.title, node.file, ...node.aliases.map((a) => `alias: ${a}`)]
        .filter(Boolean)
        .join('\n'),
      badge: withLayer ? node.layer : null,
      texts: [node.name, ...node.aliases],
    }));
  return {
    total: all.length,
    items: all.filter((item) => matchesFilter(query, item.texts)).sort(byLabel),
  };
}

export function Sidebar({
  data,
  current,
}: {
  data: GraphResponse;
  current: string | null;
}) {
  const [query, setQuery] = useState('');
  const datasets = nodeItems(
    data.graph.nodes.filter((node) => node.kind === 'dataset'),
    query,
    true,
  );
  const pipelines = nodeItems(
    data.graph.nodes.filter((node) => node.kind === 'pipeline'),
    query,
    false,
  );
  const others: Item[] = data.otherDocs
    .filter((file) => matchesFilter(query, [file]))
    .map((file) => ({ file, label: file, title: file, badge: null }));

  return (
    <nav className="sidebar">
      <a className="home-link" href="#/">
        RCD data models
      </a>
      <input
        type="search"
        className="filter"
        placeholder="Filter by name or alias"
        aria-label="Filter docs by name or alias"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Group title="Datasets" current={current} {...datasets} />
      <Group title="Pipelines" current={current} {...pipelines} />
      <Group
        title="Other docs"
        current={current}
        items={others}
        total={data.otherDocs.length}
      />
    </nav>
  );
}
