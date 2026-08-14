/**
 * Minimal, dependency-free HTML reading for adapters.
 *
 * Deliberately not a general HTML parser. It handles the one shape adapters
 * need — a linear walk of headings and flat tables — and is only safe because
 * adapters assert their fixtures have no nested tables. If a source ever needs
 * more than this, use Bun's built-in HTMLRewriter rather than growing regexes.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => ENTITIES[name] ?? whole);
}

/** Strip tags, decode entities, collapse whitespace. */
export function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export interface TableNode {
  kind: "table";
  /** Every <th> → next-sibling <td> pair, text-only. Empty for column tables. */
  pairs: Array<{ label: string; value: string }>;
  /** All <th> texts, in order — lets a caller recognise a header-row table. */
  headers: string[];
  /** Every <tr> as its cell texts, header row included. For column tables. */
  rows: string[][];
}

export interface ParagraphNode {
  kind: "p";
  text: string;
  /**
   * True when the paragraph is really a call-to-action link rather than prose.
   * Game8 wraps its "… Event Guide" buttons in the same paragraph class as body
   * copy, so callers need to tell them apart.
   */
  isButton: boolean;
}

export type DocNode =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | TableNode
  | ParagraphNode;

/**
 * Walk a document in source order, yielding h2/h3 headings and tables.
 *
 * Pure: no network, no clock. Given identical input it always yields identical
 * output, which is what makes fixture tests meaningful.
 */
export function scanDocument(rawHtml: string): DocNode[] {
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ");
  const nodes: DocNode[] = [];

  const re =
    /<h2\b[^>]*>([\s\S]*?)<\/h2>|<h3\b[^>]*>([\s\S]*?)<\/h3>|<table\b[^>]*>([\s\S]*?)<\/table>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;

  for (const m of html.matchAll(re)) {
    const [whole, h2, h3, table, p] = m;
    if (h2 !== undefined) {
      nodes.push({ kind: "h2", text: text(h2) });
    } else if (h3 !== undefined) {
      nodes.push({ kind: "h3", text: text(h3) });
    } else if (table !== undefined) {
      nodes.push(readTable(table));
    } else if (p !== undefined) {
      nodes.push({ kind: "p", text: text(p), isButton: /a-btn/.test(whole) });
    }
  }

  return nodes;
}

function readTable(body: string): TableNode {
  const headers: string[] = [];
  for (const m of body.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)) {
    headers.push(text(m[1] ?? ""));
  }

  // Label/value rows: a <th> immediately followed by a <td>.
  const pairs: Array<{ label: string; value: string }> = [];
  const pairRe = /<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  for (const m of body.matchAll(pairRe)) {
    pairs.push({ label: text(m[1] ?? ""), value: text(m[2] ?? "") });
  }

  // Row/cell grid, for column-oriented tables.
  const rows: string[][] = [];
  for (const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cell of (tr[1] ?? "").matchAll(
      /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi,
    )) {
      cells.push(text(cell[2] ?? ""));
    }
    if (cells.length > 0) rows.push(cells);
  }

  return { kind: "table", pairs, headers, rows };
}

/** True when the document contains no nested <table> elements. */
export function assertFlatTables(rawHtml: string): boolean {
  let depth = 0;
  for (const m of rawHtml.matchAll(/<table\b[^>]*>|<\/table>/gi)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth > 1) return false;
  }
  return depth === 0;
}
