/**
 * A parser for the subset of Mermaid's flowchart syntax the docs use.
 *
 * Hand-written: a cursor over the source and one function per construct.
 * It follows Mermaid's own rules where they are known (statement order,
 * which subgraph a node ends up in, how links are tokenised) and stops with
 * "unsupported: <reason>" at anything else, so the caller can hand the
 * diagram to Mermaid instead of drawing a guess.
 */

import { parseLabel, plainLabel, type LabelLine } from './flowLabel';
import { parseStyles, type StyleDecl } from './flowStyle';

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'doublecircle'
  | 'diamond'
  | 'hexagon'
  | 'lean_right'
  | 'lean_left'
  | 'trapezoid'
  | 'inv_trapezoid'
  | 'odd';

export type EdgeStroke = 'normal' | 'thick' | 'dotted';
export type EdgeEnd = 'none' | 'arrow' | 'cross' | 'circle';

export interface FlowNode {
  id: string;
  label: LabelLine[];
  shape: Shape;
  classes: string[];
  /** From `style` statements only. */
  ownStyles: StyleDecl[];
  /** classDef `default`, then its classes, then `style`: what is drawn. */
  style: StyleDecl[];
  /** Label tags kept as text (anything but br, i, em, b, strong). */
  literalTags: string[];
  /** 1-based line of its first mention. */
  line: number;
}

export interface FlowEdge {
  /** Position among all links, as `linkStyle` counts them. */
  index: number;
  /** Node or subgraph ids. */
  from: string;
  to: string;
  label: LabelLine[] | null;
  literalTags: string[];
  stroke: EdgeStroke;
  start: EdgeEnd;
  end: EdgeEnd;
  /** 1 for `-->`, 2 for `--->` and so on: how many ranks it spans at least. */
  length: number;
  /** From `linkStyle`, default first. */
  style: StyleDecl[];
  line: number;
}

export interface FlowSubgraph {
  id: string;
  title: LabelLine[];
  literalTags: string[];
  direction: Direction | null;
  /** Nodes directly in it, not in a nested subgraph. */
  nodes: string[];
  /** Subgraphs directly in it. */
  subgraphs: string[];
  parent: string | null;
  classes: string[];
  style: StyleDecl[];
  line: number;
}

export interface FlowChart {
  direction: Direction;
  /** In order of first mention. */
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Outermost first, each before the subgraphs it contains. */
  subgraphs: FlowSubgraph[];
  classDefs: Map<string, StyleDecl[]>;
}

export type FlowParse =
  { ok: true; chart: FlowChart } | { ok: false; reason: string; line: number };

class Unsupported extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

const DIRECTIONS: Record<string, Direction> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

const KEYWORDS = new Set([
  'subgraph',
  'end',
  'direction',
  'classDef',
  'class',
  'style',
  'linkStyle',
  'click',
  'call',
  'href',
  'callback',
  'accTitle',
  'accDescr',
  'default',
  'interpolate',
]);

/** Openers, longest first, with what closes them. */
const SHAPES: { open: string; close: string[]; shapes: Shape[] }[] = [
  { open: '(((', close: [')))'], shapes: ['doublecircle'] },
  { open: '((', close: ['))'], shapes: ['circle'] },
  { open: '([', close: ['])'], shapes: ['stadium'] },
  { open: '[[', close: [']]'], shapes: ['subroutine'] },
  { open: '[(', close: [')]'], shapes: ['cylinder'] },
  { open: '{{', close: ['}}'], shapes: ['hexagon'] },
  { open: '[/', close: ['/]', '\\]'], shapes: ['lean_right', 'trapezoid'] },
  { open: '[\\', close: ['\\]', '/]'], shapes: ['lean_left', 'inv_trapezoid'] },
  { open: '(', close: [')'], shapes: ['round'] },
  { open: '[', close: [']'], shapes: ['rect'] },
  { open: '{', close: ['}'], shapes: ['diamond'] },
  { open: '>', close: [']'], shapes: ['odd'] },
];

const isIdChar = (char: string | undefined) =>
  char !== undefined && /[\p{L}\p{N}_]/u.test(char);
const isSpace = (char: string | undefined) => char === ' ' || char === '\t';
/** Characters that end unquoted label text. */
const TEXT_STOP = /[[\](){}"|]/;

interface Link {
  stroke: EdgeStroke;
  start: EdgeEnd;
  end: EdgeEnd;
  length: number;
  label: { lines: LabelLine[]; literalTags: string[] } | null;
}

interface NodeState {
  id: string;
  label: LabelLine[];
  literalTags: string[];
  shape: Shape;
  /** Declared with a shape or text somewhere. */
  declared: boolean;
  classes: string[];
  ownStyles: StyleDecl[];
  line: number;
}

interface OpenSubgraph {
  id: string;
  title: LabelLine[];
  literalTags: string[];
  direction: Direction | null;
  /** Ids mentioned in its statements and closed nested subgraphs, in order. */
  mentions: { id: string; nested: boolean }[];
  line: number;
}

interface ClosedSubgraph extends FlowSubgraph {
  members: string[];
}

class Parser {
  private i = 0;
  private direction: Direction = 'TB';
  private readonly nodes = new Map<string, NodeState>();
  private readonly edges: Omit<FlowEdge, 'style'>[] = [];
  private readonly open: OpenSubgraph[] = [];
  private readonly closed: ClosedSubgraph[] = [];
  /** Which closed subgraph a node or subgraph id belongs to. */
  private readonly owner = new Map<string, string>();
  private readonly classDefs = new Map<string, StyleDecl[]>();
  private readonly classOrder: string[] = [];
  private readonly linkStyles: {
    targets: number[] | 'default';
    decls: StyleDecl[];
    at: number;
  }[] = [];
  private readonly subgraphClasses: { ids: string[]; name: string }[] = [];

  constructor(private readonly src: string) {}

  private fail(message: string, at = this.i): never {
    throw new Unsupported(message, at);
  }

  lineOf(at: number): number {
    let line = 1;
    for (let k = 0; k < at && k < this.src.length; k++) {
      if (this.src[k] === '\n') line += 1;
    }
    return line;
  }

  private peek(offset = 0): string | undefined {
    return this.src[this.i + offset];
  }

  private startsWith(text: string): boolean {
    return this.src.startsWith(text, this.i);
  }

  private skipSpaces(): void {
    while (isSpace(this.peek())) this.i += 1;
  }

  private atStatementEnd(): boolean {
    const char = this.peek();
    return char === undefined || char === '\n' || char === '\r' || char === ';';
  }

  /** Spaces, then a newline, `;` or the end; anything else is unsupported. */
  private endStatement(what: string): void {
    this.skipSpaces();
    if (this.startsWith('%%')) {
      this.fail('a %% comment after a statement on the same line');
    }
    if (!this.atStatementEnd()) {
      this.fail(`unexpected “${this.rest(12)}” after ${what}`);
    }
    if (this.peek() === '\r') this.i += 1;
    if (this.peek() !== undefined) this.i += 1;
  }

  private rest(length: number): string {
    const text = this.src.slice(this.i, this.i + length).split('\n')[0] ?? '';
    return text.length === length ? `${text}…` : text;
  }

  private readId(): string {
    const start = this.i;
    while (isIdChar(this.peek())) this.i += 1;
    return this.src.slice(start, this.i);
  }

  private readWord(): string {
    const match = /^[A-Za-z][A-Za-z0-9_-]*/.exec(this.src.slice(this.i));
    if (match === null) return '';
    this.i += match[0].length;
    return match[0];
  }

  /** Blank lines, `;`, `%%` comments and `%%{ … }%%` directives. */
  private skipBlank(): void {
    for (;;) {
      const char = this.peek();
      if (isSpace(char) || char === '\n' || char === '\r' || char === ';') {
        this.i += 1;
      } else if (this.startsWith('%%{')) {
        const close = this.src.indexOf('}%%', this.i);
        if (close < 0) this.fail('an unclosed %%{ directive');
        this.i = close + 3;
      } else if (this.startsWith('%%')) {
        while (this.peek() !== undefined && this.peek() !== '\n') this.i += 1;
      } else {
        return;
      }
    }
  }

  parse(): FlowChart {
    this.skipBlank();
    if (this.startsWith('---')) {
      this.fail('front matter (---) at the start');
    }
    const keyword = this.readWord();
    if (keyword !== 'flowchart' && keyword !== 'graph') {
      this.fail(
        `not a flowchart (it starts with “${keyword || this.rest(12)}”)`,
      );
    }
    if (!isSpace(this.peek()) && !this.atStatementEnd()) {
      this.fail(`unknown diagram type “${keyword}${this.rest(8)}”`);
    }
    this.skipSpaces();
    if (!this.atStatementEnd()) {
      const word = this.readWord();
      const direction = DIRECTIONS[word];
      if (direction === undefined) {
        this.fail(`unknown direction “${word || this.rest(4)}”`);
      }
      this.direction = direction;
    }
    this.endStatement('the diagram type');

    for (;;) {
      this.skipBlank();
      if (this.peek() === undefined) break;
      this.statement();
    }
    const unclosed = this.open[this.open.length - 1];
    if (unclosed !== undefined) {
      this.fail(`subgraph ${unclosed.id} has no end`, this.src.length);
    }
    return this.finish();
  }

  private statement(): void {
    const start = this.i;
    const word = /^[A-Za-z]+/.exec(this.src.slice(this.i))?.[0];
    const after =
      word === undefined ? undefined : this.src[this.i + word.length];
    const keyword =
      word !== undefined &&
      KEYWORDS.has(word) &&
      (after === undefined || !isIdChar(after));
    if (!keyword) {
      this.vertexStatement();
      return;
    }
    this.i += word.length;
    switch (word) {
      case 'subgraph':
        this.subgraph();
        return;
      case 'end':
        this.endSubgraph(start);
        return;
      case 'direction':
        this.directionStatement();
        return;
      case 'classDef':
        this.classDef();
        return;
      case 'class':
        this.classStatement();
        return;
      case 'style':
        this.styleStatement();
        return;
      case 'linkStyle':
        this.linkStyle();
        return;
      default:
        this.fail(`the ${word} statement`, start);
    }
  }

  private spaceThen(what: string): void {
    if (!isSpace(this.peek())) this.fail(`expected a space before ${what}`);
    this.skipSpaces();
  }

  private subgraph(): void {
    this.spaceThen('the subgraph id');
    const at = this.i;
    if (this.peek() === '"')
      this.fail('a subgraph with a quoted title and no id');
    const id = this.readId();
    if (id === '') this.fail('a subgraph id that is not a plain word');
    if (KEYWORDS.has(id)) this.fail(`a subgraph named “${id}”`, at);
    let title = plainLabel(id);
    let literalTags: string[] = [];
    this.skipSpaces();
    if (this.peek() === '[') {
      this.i += 1;
      const text = this.labelText([']'], 'subgraph title');
      const parsed = this.label(text.text, at);
      title = parsed.lines;
      literalTags = parsed.literalTags;
    }
    if (
      this.open.some((sg) => sg.id === id) ||
      this.closed.some((sg) => sg.id === id)
    ) {
      this.fail(`subgraph ${id} declared twice`, at);
    }
    this.endStatement(`subgraph ${id}`);
    this.open.push({
      id,
      title,
      literalTags,
      direction: null,
      mentions: [],
      line: this.lineOf(at),
    });
  }

  private endSubgraph(at: number): void {
    this.endStatement('end');
    const sg = this.open.pop();
    if (sg === undefined) this.fail('“end” without a subgraph', at);
    // Mermaid gives a node to the first subgraph that closes with it in
    // its statements; nested subgraphs close before their parent
    const members: string[] = [];
    const subgraphs: string[] = [];
    for (const { id, nested } of sg.mentions) {
      if (this.owner.has(id)) continue;
      if (members.includes(id) || subgraphs.includes(id)) continue;
      if (nested) {
        subgraphs.push(id);
      } else if (this.isSubgraphId(id)) {
        this.fail(`subgraph ${id} is linked from inside subgraph ${sg.id}`, at);
      } else {
        members.push(id);
      }
    }
    for (const id of [...members, ...subgraphs]) this.owner.set(id, sg.id);
    this.closed.push({
      id: sg.id,
      title: sg.title,
      literalTags: sg.literalTags,
      direction: sg.direction,
      nodes: members,
      subgraphs,
      members,
      parent: null,
      classes: [],
      style: [],
      line: sg.line,
    });
    this.open[this.open.length - 1]?.mentions.push({ id: sg.id, nested: true });
  }

  private isSubgraphId(id: string): boolean {
    return (
      this.closed.some((sg) => sg.id === id) ||
      this.open.some((sg) => sg.id === id)
    );
  }

  private directionStatement(): void {
    this.spaceThen('the direction');
    const word = this.readWord();
    const direction = DIRECTIONS[word];
    if (direction === undefined) this.fail(`unknown direction “${word}”`);
    this.endStatement('direction');
    const sg = this.open[this.open.length - 1];
    if (sg === undefined) this.fail('“direction” outside a subgraph');
    sg.direction = direction;
  }

  private styleText(what: string): StyleDecl[] {
    this.skipSpaces();
    const start = this.i;
    while (!this.atStatementEnd()) this.i += 1;
    const text = this.src.slice(start, this.i).trim();
    const decls = text === '' ? null : parseStyles(text);
    if (decls === null) this.fail(`unreadable styles in ${what}`, start);
    this.endStatement(what);
    return decls;
  }

  private nameList(what: string, read: () => string): string[] {
    const names: string[] = [];
    for (;;) {
      const name = read();
      if (name === '') this.fail(`expected a name in ${what}`);
      names.push(name);
      if (this.peek() !== ',') return names;
      this.i += 1;
    }
  }

  private readClassName = (): string => this.take(/^[A-Za-z0-9_-]+/);

  private take(pattern: RegExp): string {
    const match = pattern.exec(this.src.slice(this.i));
    if (match === null) return '';
    this.i += match[0].length;
    return match[0];
  }

  private classDef(): void {
    this.spaceThen('the class name');
    const names = this.nameList('classDef', this.readClassName);
    this.spaceThen('the styles');
    const decls = this.styleText('classDef');
    for (const name of names) {
      const previous = this.classDefs.get(name) ?? [];
      this.classDefs.set(name, [...previous, ...decls]);
      if (!this.classOrder.includes(name)) this.classOrder.push(name);
    }
  }

  private classStatement(): void {
    this.spaceThen('the node ids');
    const ids = this.nameList('class', () => this.readId());
    this.spaceThen('the class name');
    const name = this.readClassName();
    if (name === '') this.fail('expected a class name');
    if (this.peek() === ',')
      this.fail('more than one class in a class statement');
    this.endStatement('class');
    // As Mermaid: only ids that exist by now get the class
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (node !== undefined) {
        if (!node.classes.includes(name)) node.classes.push(name);
      } else if (this.isSubgraphId(id)) {
        this.subgraphClasses.push({ ids: [id], name });
      }
    }
  }

  private styleStatement(): void {
    this.spaceThen('the node id');
    const at = this.i;
    const id = this.readId();
    if (id === '') this.fail('expected a node id in style');
    this.spaceThen('the styles');
    const decls = this.styleText('style');
    if (this.isSubgraphId(id)) this.fail(`style on subgraph ${id}`, at);
    this.touch(id, at).ownStyles.push(...decls);
  }

  private linkStyle(): void {
    this.spaceThen('the link numbers');
    const at = this.i;
    let targets: number[] | 'default';
    if (this.startsWith('default') && !isIdChar(this.peek(7))) {
      this.i += 7;
      targets = 'default';
    } else {
      targets = this.nameList('linkStyle', () => this.take(/^\d+/)).map(Number);
    }
    this.spaceThen('the styles');
    if (this.startsWith('interpolate')) this.fail('linkStyle interpolate');
    const decls = this.styleText('linkStyle');
    this.linkStyles.push({ targets, decls, at });
  }

  /** A node by id, created (as Mermaid does) if this is its first mention. */
  private touch(id: string, at: number): NodeState {
    let node = this.nodes.get(id);
    if (node === undefined) {
      node = {
        id,
        label: plainLabel(id),
        literalTags: [],
        shape: 'rect',
        declared: false,
        classes: [],
        ownStyles: [],
        line: this.lineOf(at),
      };
      this.nodes.set(id, node);
    }
    return node;
  }

  private label(text: string, at: number) {
    const parsed = parseLabel(text);
    if (!parsed.ok) this.fail(parsed.reason, at);
    return parsed;
  }

  /**
   * Label text up to one of `closers`: a quoted string right after the
   * opener, or plain text that holds none of `[](){}"|`.
   */
  private labelText(
    closers: string[],
    what: string,
    stop: RegExp = TEXT_STOP,
  ): { text: string; closer: string } {
    const at = this.i;
    let text: string;
    if (this.peek() === '"') {
      const end = this.src.indexOf('"', this.i + 1);
      const line = this.src.indexOf('\n', this.i);
      if (end < 0 || (line >= 0 && line < end)) {
        this.fail(`an unclosed quote in a ${what}`, at);
      }
      if (this.src[end + 1] === '`' || this.src[this.i + 1] === '`') {
        this.fail(`a Markdown string in a ${what}`, at);
      }
      text = this.src.slice(this.i + 1, end);
      this.i = end + 1;
    } else {
      const start = this.i;
      while (this.peek() !== undefined && this.peek() !== '\n') {
        if (stop.test(this.peek() as string)) break;
        this.i += 1;
      }
      text = this.src.slice(start, this.i).trim();
      if (text === '') this.fail(`an empty ${what}`, at);
      if (text.startsWith('`')) this.fail(`a Markdown string in a ${what}`, at);
    }
    const closer = closers.find((c) => this.startsWith(c));
    if (closer === undefined) {
      this.fail(
        this.peek() === undefined || this.peek() === '\n'
          ? `an unclosed ${what}`
          : `unexpected “${this.rest(6)}” in a ${what}`,
        at,
      );
    }
    this.i += closer.length;
    return { text, closer };
  }

  /** `id`, `id[text]` (any shape), each optionally followed by `:::class`. */
  private node(): string {
    const at = this.i;
    const id = this.readId();
    if (id === '') {
      this.fail(
        this.atStatementEnd()
          ? 'a link with nothing after it'
          : `unexpected “${this.rest(8)}” where a node id should be`,
      );
    }
    if (KEYWORDS.has(id)) this.fail(`a node named “${id}”`, at);
    if (this.startsWith('@{')) this.fail('the @{ } node syntax');
    if (isSpace(this.peek()) && /^[ \t]+[[({]/.test(this.src.slice(this.i))) {
      this.fail(`a space between node ${id} and its shape`);
    }
    const shape = SHAPES.find(({ open }) => this.startsWith(open));
    if (shape !== undefined) {
      if (this.startsWith('(-') || this.startsWith('[|')) {
        this.fail(`an unsupported node shape “${this.rest(2)}”`);
      }
      this.i += shape.open.length;
      const lean = shape.open === '[/' || shape.open === '[\\';
      const { text, closer } = this.labelText(
        shape.close,
        'node label',
        lean ? /[[\](){}"|/\\]/ : TEXT_STOP,
      );
      const parsed = this.label(text, at);
      if (this.isSubgraphId(id))
        this.fail(`subgraph ${id} given a node shape`, at);
      const node = this.touch(id, at);
      node.label = parsed.lines;
      node.literalTags = parsed.literalTags;
      node.shape = shape.shapes[shape.close.indexOf(closer)] as Shape;
      node.declared = true;
    } else if (!this.isSubgraphId(id)) {
      this.touch(id, at);
    }
    if (this.startsWith(':::')) {
      this.i += 3;
      const name = this.readClassName();
      if (name === '') this.fail('expected a class name after :::');
      if (this.isSubgraphId(id)) {
        this.subgraphClasses.push({ ids: [id], name });
      } else {
        const node = this.touch(id, at);
        if (!node.classes.includes(name)) node.classes.push(name);
      }
    }
    if (isIdChar(this.peek()))
      this.fail(`unexpected “${this.rest(6)}” after ${id}`);
    return id;
  }

  private nodeGroup(): string[] {
    const ids = [this.node()];
    for (;;) {
      const save = this.i;
      this.skipSpaces();
      if (this.peek() !== '&') {
        this.i = save;
        return ids;
      }
      this.i += 1;
      this.skipSpaces();
      ids.push(this.node());
    }
  }

  private vertexStatement(): void {
    const at = this.i;
    let left = this.nodeGroup();
    const mentioned = [...left];
    for (;;) {
      this.skipSpaces();
      if (this.atStatementEnd() || this.startsWith('%%')) break;
      const linkAt = this.i;
      const link = this.link();
      this.skipSpaces();
      const right = this.nodeGroup();
      mentioned.push(...right);
      for (const from of left) {
        for (const to of right) {
          this.edges.push({
            index: this.edges.length,
            from,
            to,
            label: link.label?.lines ?? null,
            literalTags: link.label?.literalTags ?? [],
            stroke: link.stroke,
            start: link.start,
            end: link.end,
            length: link.length,
            line: this.lineOf(linkAt),
          });
        }
      }
      left = right;
    }
    this.endStatement('a node or link');
    const sg = this.open[this.open.length - 1];
    if (sg !== undefined) {
      for (const id of mentioned) sg.mentions.push({ id, nested: false });
    }
    if (mentioned.length === 0) this.fail('an empty statement', at);
  }

  private endOf(char: string): EdgeEnd {
    return char === '>'
      ? 'arrow'
      : char === 'x'
        ? 'cross'
        : char === 'o'
          ? 'circle'
          : 'none';
  }

  /**
   * A link, tokenised like Mermaid's lexer: `-->`, `---`, `==>`, `-.->`
   * with any length, `x`/`o`/`<` ends, and a label as `|text|` after it or
   * written inside (`-- text -->`).
   */
  private link(): Link {
    const at = this.i;
    const rest = this.src.slice(this.i);
    if (rest.startsWith('~~~')) this.fail('an invisible link (~~~)');
    let start: EdgeEnd = 'none';
    let k = 0;
    if (/^[<xo][-=.]/.test(rest)) {
      start = rest[0] === '<' ? 'arrow' : this.endOf(rest[0] as string);
      k = 1;
    }
    const body = rest.slice(k);
    let link: Link;
    let consumed: number;
    let full = /^(-{2,})([-xo>])/.exec(body);
    if (full !== null) {
      link = {
        stroke: 'normal',
        start,
        end: this.endOf(full[2] as string),
        length: (full[1] as string).length - 1,
        label: null,
      };
      consumed = full[0].length;
    } else if ((full = /^(={2,})([=xo>])/.exec(body)) !== null) {
      link = {
        stroke: 'thick',
        start,
        end: this.endOf(full[2] as string),
        length: (full[1] as string).length - 1,
        label: null,
      };
      consumed = full[0].length;
    } else if ((full = /^-(\.+)-([xo>]?)/.exec(body)) !== null) {
      link = {
        stroke: 'dotted',
        start,
        end: this.endOf(full[2] as string),
        length: (full[1] as string).length,
        label: null,
      };
      consumed = full[0].length;
    } else if (/^(--|==|-\.)/.test(body)) {
      return this.textLink(at, start, k);
    } else {
      this.fail(`expected a link at “${this.rest(8)}”`);
    }
    this.i += k + consumed;
    const after = this.peek();
    if ((link.end === 'cross' || link.end === 'circle') && isIdChar(after)) {
      this.fail(
        `an ${link.end === 'cross' ? 'x' : 'o'} link end right before a node id`,
        at,
      );
    }
    if (
      body[consumed] === '-' ||
      body[consumed] === '=' ||
      body[consumed] === '.'
    ) {
      this.fail(`an unusual link “${this.rest(6)}”`, at);
    }
    this.checkEnds(link, at);
    const save = this.i;
    this.skipSpaces();
    if (this.peek() === '|') {
      this.i += 1;
      const text = this.pipeText();
      link.label = this.label(text, at);
    } else {
      this.i = save;
    }
    return link;
  }

  private checkEnds(link: Link, at: number): void {
    if (link.start !== 'none' && link.start !== link.end) {
      this.fail('a link whose two ends do not match', at);
    }
  }

  private pipeText(): string {
    const at = this.i;
    let text: string;
    if (this.peek() === '"') {
      const end = this.src.indexOf('"', this.i + 1);
      const line = this.src.indexOf('\n', this.i);
      if (end < 0 || (line >= 0 && line < end))
        this.fail('an unclosed quote in a link label', at);
      text = this.src.slice(this.i + 1, end);
      this.i = end + 1;
      this.skipSpaces();
    } else {
      const start = this.i;
      while (
        this.peek() !== undefined &&
        this.peek() !== '\n' &&
        this.peek() !== '|'
      ) {
        if (this.peek() === '"')
          this.fail('a quote inside an unquoted link label');
        this.i += 1;
      }
      text = this.src.slice(start, this.i).trim();
      if (text === '') this.fail('an empty link label', at);
    }
    if (this.peek() !== '|') this.fail('an unclosed link label (|)', at);
    this.i += 1;
    return text;
  }

  /** `-- text -->`, `== text ==>`, `-. text .->`. */
  private textLink(at: number, start: EdgeEnd, k: number): Link {
    const opener = this.src.slice(this.i + k, this.i + k + 2);
    const stroke: EdgeStroke =
      opener === '--' ? 'normal' : opener === '==' ? 'thick' : 'dotted';
    this.i += k + 2;
    // As Mermaid's lexer: the label ends at the first place the closing
    // link matches, spaces before it included
    const ender =
      stroke === 'normal'
        ? /[ \t]*([xo<]?)(-{2,})([-xo>])/y
        : stroke === 'thick'
          ? /[ \t]*([xo<]?)(={2,})([=xo>])/y
          : /[ \t]*([xo<]?)(-?)(\.+)-([xo>]?)/y;
    const textStart = this.i;
    let match: RegExpExecArray | null = null;
    let quoted: string | null = null;
    this.skipSpaces();
    if (this.peek() === '"') {
      const end = this.src.indexOf('"', this.i + 1);
      const line = this.src.indexOf('\n', this.i);
      if (end < 0 || (line >= 0 && line < end))
        this.fail('an unclosed quote in a link label', at);
      quoted = this.src.slice(this.i + 1, end);
      this.i = end + 1;
      ender.lastIndex = this.i;
      match = ender.exec(this.src);
      if (match === null)
        this.fail('expected the end of the link after its label', at);
    } else {
      for (
        let p = textStart;
        p < this.src.length && this.src[p] !== '\n';
        p++
      ) {
        ender.lastIndex = p;
        match = ender.exec(this.src);
        if (match !== null) {
          this.i = p;
          break;
        }
      }
      if (match === null) this.fail('a link label with no end of link', at);
    }
    const text = quoted ?? this.src.slice(textStart, this.i).trim();
    if (text === '') this.fail('an empty link label', at);
    if (quoted === null && /["|]/.test(text)) {
      this.fail('a quote or | inside an unquoted link label', at);
    }
    if (match[1] !== '')
      this.fail(`an unusual link end “${match[0].trim()}”`, at);
    let end: EdgeEnd;
    let length: number;
    if (stroke === 'dotted') {
      end = this.endOf(match[4] as string);
      length = (match[3] as string).length;
    } else {
      end = this.endOf(match[3] as string);
      length = (match[2] as string).length - 1;
    }
    this.i = match.index + match[0].length;
    const link: Link = {
      stroke,
      start,
      end,
      length: Math.max(1, length),
      label: this.label(text, at),
    };
    if ((end === 'cross' || end === 'circle') && isIdChar(this.peek())) {
      this.fail(
        `an ${end === 'cross' ? 'x' : 'o'} link end right before a node id`,
        at,
      );
    }
    this.checkEnds(link, at);
    const save = this.i;
    this.skipSpaces();
    if (this.peek() === '|') this.fail('a link with two labels', at);
    this.i = save;
    return link;
  }

  private finish(): FlowChart {
    const subgraphIds = new Set(this.closed.map((sg) => sg.id));
    for (const node of this.nodes.values()) {
      if (subgraphIds.has(node.id)) {
        if (node.declared)
          this.fail(`${node.id} is both a node and a subgraph`);
        if (node.ownStyles.length > 0 || node.classes.length > 0) {
          this.fail(`styles on subgraph ${node.id}`);
        }
      }
    }
    for (const sg of this.closed) {
      const nested = sg.members.find((id) => subgraphIds.has(id));
      if (nested !== undefined) {
        this.fail(`subgraph ${nested} is linked from inside subgraph ${sg.id}`);
      }
    }
    const parentOf = new Map<string, string>();
    for (const sg of this.closed) {
      for (const child of sg.subgraphs) parentOf.set(child, sg.id);
    }
    for (const { ids, name } of this.subgraphClasses) {
      for (const id of ids) {
        const sg = this.closed.find((s) => s.id === id);
        if (sg !== undefined && !sg.classes.includes(name))
          sg.classes.push(name);
      }
    }
    const defaultDecls = this.classDefs.get('default') ?? [];
    const classDecls = (classes: string[]) =>
      this.classOrder
        .filter((name) => name !== 'default' && classes.includes(name))
        .flatMap((name) => this.classDefs.get(name) ?? []);

    const nodes: FlowNode[] = [...this.nodes.values()]
      .filter((node) => !subgraphIds.has(node.id))
      .map((node) => ({
        id: node.id,
        label: node.label,
        shape: node.shape,
        classes: node.classes,
        ownStyles: node.ownStyles,
        style: [
          ...defaultDecls,
          ...classDecls(node.classes),
          ...node.ownStyles,
        ],
        literalTags: node.literalTags,
        line: node.line,
      }));

    const edgeStyles = this.edges.map((): StyleDecl[] => []);
    const defaults: StyleDecl[] = [];
    for (const { targets, decls, at } of this.linkStyles) {
      if (targets === 'default') {
        defaults.push(...decls);
        continue;
      }
      for (const index of targets) {
        const list = edgeStyles[index];
        if (list === undefined) {
          this.fail(
            `linkStyle ${index}: there are only ${this.edges.length} links`,
            at,
          );
        }
        list.push(...decls);
      }
    }
    const edges: FlowEdge[] = this.edges.map((edge, index) => ({
      ...edge,
      style: [...defaults, ...(edgeStyles[index] ?? [])],
    }));

    // Outermost first, so a parent always comes before its children
    const depth = (id: string): number => {
      const parent = parentOf.get(id);
      return parent === undefined ? 0 : depth(parent) + 1;
    };
    const subgraphs: FlowSubgraph[] = this.closed
      .map((sg, order) => ({ sg, order }))
      .sort((a, b) => depth(a.sg.id) - depth(b.sg.id) || a.order - b.order)
      .map(({ sg }) => ({
        id: sg.id,
        title: sg.title,
        literalTags: sg.literalTags,
        direction: sg.direction,
        nodes: sg.members,
        subgraphs: sg.subgraphs,
        parent: parentOf.get(sg.id) ?? null,
        classes: sg.classes,
        style: [...classDecls(sg.classes)],
        line: sg.line,
      }));

    return {
      direction: this.direction,
      nodes,
      edges,
      subgraphs,
      classDefs: this.classDefs,
    };
  }
}

/** Parses a flowchart, or says why the viewer should not draw it. */
export function parseFlowchart(source: string): FlowParse {
  const parser = new Parser(source);
  try {
    return { ok: true, chart: parser.parse() };
  } catch (error) {
    if (error instanceof Unsupported) {
      return {
        ok: false,
        reason: error.message,
        line: parser.lineOf(error.at),
      };
    }
    throw error;
  }
}

/** The diagram type a Mermaid source declares: its first word. */
export function diagramType(source: string): string {
  const lines = source.split('\n');
  let inDirective = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inDirective) {
      if (line.includes('}%%')) inDirective = false;
      continue;
    }
    if (line === '' || (line.startsWith('%%') && !line.startsWith('%%{')))
      continue;
    if (line.startsWith('%%{')) {
      if (!line.includes('}%%')) inDirective = true;
      continue;
    }
    return /^[A-Za-z][\w-]*/.exec(line)?.[0] ?? line;
  }
  return '';
}
