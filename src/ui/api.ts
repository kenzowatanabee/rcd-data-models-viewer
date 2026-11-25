import { useEffect, useState } from 'react';

import {
  DOCS_CHANGED_EVENT,
  type GraphResponse,
  type HeadingsResponse,
} from '../server/api';

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

async function errorOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function fetchGraph(): Promise<Loaded<GraphResponse>> {
  try {
    const response = await fetch('/api/graph');
    if (!response.ok) return { ok: false, error: await errorOf(response) };
    return { ok: true, value: (await response.json()) as GraphResponse };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function fetchHeadings(): Promise<Loaded<HeadingsResponse>> {
  try {
    const response = await fetch('/api/headings');
    if (!response.ok) return { ok: false, error: await errorOf(response) };
    return { ok: true, value: (await response.json()) as HeadingsResponse };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function fetchDoc(file: string): Promise<Loaded<string>> {
  try {
    const response = await fetch(`/api/doc?file=${encodeURIComponent(file)}`);
    if (!response.ok) {
      return {
        ok: false,
        error: `${response.status}: ${await errorOf(response)}`,
      };
    }
    return { ok: true, value: await response.text() };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** A number that goes up each time the server reports edited docs. */
export function useDocsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const bump = () => setVersion((v) => v + 1);
    hot.on(DOCS_CHANGED_EVENT, bump);
    return () => hot.off(DOCS_CHANGED_EVENT, bump);
  }, []);
  return version;
}
