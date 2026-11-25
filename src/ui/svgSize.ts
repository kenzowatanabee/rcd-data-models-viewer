/**
 * Mermaid sizes diagrams to fit their container, which shrinks a large
 * flowchart to unreadable text. This gives the `<svg>` its natural width from
 * the viewBox instead, so it can scroll; CSS can still fit it on request.
 */
export function naturalSize(svg: string): string {
  const open = /^<svg\b[^>]*>/.exec(svg)?.[0];
  if (open === undefined) return svg;
  const viewBox =
    /\bviewBox="[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+[\d.e]+"/.exec(open);
  const width = viewBox?.[1];
  if (width === undefined) return svg;
  const fixed = open
    .replace(/\swidth="[^"]*"/, '')
    .replace(/max-width:\s*[^;"]+;?\s*/, '')
    .replace(/^<svg/, `<svg width="${width}"`);
  return fixed + svg.slice(open.length);
}
