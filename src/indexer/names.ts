/**
 * Case, accents, backticks and space / hyphen / underscore differences.
 * Kept free of Node imports so the browser can share it.
 */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[`*]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '_');
}
