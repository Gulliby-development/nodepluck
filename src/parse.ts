import type {
  AndExpr,
  CallExpr,
  ComparisonExpr,
  Expr,
  FilterSelector,
  NameSelector,
  NotExpr,
  OrExpr,
  ParenthesizedExpr,
  Query,
  QueryExpr,
  Segment,
  Selector,
  SliceSelector,
} from "./ast";
import { Failure, Fault } from "./fault";
import { checkTypes } from "./funcs";
import {
  isIdentStart,
  isNameStart,
  isNumberStart,
  isQuote,
  scanIdent,
  scanInt,
  scanName,
  scanNumber,
  scanString,
  skipBlank,
  unexpected,
} from "./lex";
import { codePoints, hasSurrogate, show } from "./text";

type Parsed<T> = { value: T; next: number };

class Parser {
  constructor(private readonly t: readonly string[]) {}

  query(start: number, depth = 0): Parsed<Query> {
    const root = this.t[start];
    if (root !== "$" && root !== "@") {
      throw unexpected(this.t, start);
    }

    let next = start + 1;
    const segments: Segment[] = [];

    while (true) {
      const probe = skipBlank(this.t, next);
      if (this.t[probe] === ".") {
        const segment = this.dotSegment(probe, depth);
        segments.push(segment.value);
        next = segment.next;
        continue;
      }
      if (this.t[probe] === "[") {
        const segment = this.bracketSegment(probe, depth);
        segments.push(segment.value);
        next = segment.next;
        continue;
      }
      break;
    }

    return {
      value: { col: start + 1, root, segments },
      next,
    };
  }

  selector(start: number, depth: number): Parsed<Selector> {
    const character = this.t[start];
    if (character === undefined) {
      throw unexpected(this.t, start);
    }

    if (isQuote(this.t, start)) {
      const scanned = scanString(this.t, start);
      const selector: NameSelector = {
        col: start + 1,
        kind: "name",
        name: scanned.value,
      };
      return { value: selector, next: scanned.next };
    }

    if (character === "*") {
      return { value: { col: start + 1, kind: "wild" }, next: start + 1 };
    }

    if (character === "?") {
      const expressionStart = skipBlank(this.t, start + 1);
      const expression = this.orExpression(expressionStart, depth);
      const filter: FilterSelector = {
        col: start + 1,
        kind: "filter",
        expr: expression.value,
        source: this.t.slice(expressionStart, expression.next).join(""),
      };
      return { value: filter, next: expression.next };
    }

    if (character === ":" || isNumberStart(this.t, start)) {
      return this.sliceOrIndex(start);
    }

    throw unexpected(this.t, start);
  }

  private dotSegment(start: number, depth: number): Parsed<Segment> {
    let selectorStart = start + 1;
    let mode: "child" | "descendant" = "child";
    if (this.t[selectorStart] === ".") {
      mode = "descendant";
      selectorStart += 1;
    }

    if (this.t[selectorStart] === "*") {
      return {
        value: {
          col: start + 1,
          mode,
          selectors: [{ col: selectorStart + 1, kind: "wild" }],
        },
        next: selectorStart + 1,
      };
    }

    if (this.t[selectorStart] === "[") {
      if (mode !== "descendant") {
        throw unexpected(this.t, selectorStart);
      }
      const bracket = this.bracketContents(selectorStart, depth);
      return {
        value: { col: start + 1, mode, selectors: bracket.value.selectors },
        next: bracket.next,
      };
    }

    if (!isNameStart(this.t, selectorStart)) {
      throw unexpected(this.t, selectorStart);
    }
    const name = scanName(this.t, selectorStart);
    return {
      value: {
        col: start + 1,
        mode,
        selectors: [{ col: selectorStart + 1, kind: "name", name: name.value }],
      },
      next: name.next,
    };
  }

  private bracketSegment(start: number, depth: number): Parsed<Segment> {
    const bracket = this.bracketContents(start, depth);
    return {
      value: { col: start + 1, mode: "child", selectors: bracket.value.selectors },
      next: bracket.next,
    };
  }

  private bracketContents(start: number, depth: number): Parsed<{ selectors: Selector[] }> {
    this.checkOpen(start, depth);
    const insideDepth = depth + 1;
    let cursor = skipBlank(this.t, start + 1);
    if (this.t[cursor] === "]") {
      throw unexpected(this.t, cursor);
    }

    const selectors: Selector[] = [];
    while (true) {
      const selector = this.selector(cursor, insideDepth);
      selectors.push(selector.value);
      cursor = skipBlank(this.t, selector.next);

      if (this.t[cursor] === "]") {
        return { value: { selectors }, next: cursor + 1 };
      }
      if (this.t[cursor] !== ",") {
        throw unexpected(this.t, cursor);
      }

      cursor = skipBlank(this.t, cursor + 1);
      if (this.t[cursor] === "]") {
        throw unexpected(this.t, cursor);
      }
    }
  }

  private sliceOrIndex(start: number): Parsed<Selector> {
    if (this.t[start] === ":") {
      return this.slice(start, null, start);
    }

    const first = scanInt(this.t, start);
    const colon = skipBlank(this.t, first.next);
    if (this.t[colon] !== ":") {
      return {
        value: { col: start + 1, kind: "index", index: first.value },
        next: first.next,
      };
    }

    return this.slice(start, first.value, colon);
  }

  private slice(
    start: number,
    startValue: number | null,
    firstColon: number,
  ): Parsed<SliceSelector> {
    const cursor = firstColon + 1;
    let endValue: number | null = null;
    let end = cursor;
    const endCandidate = skipBlank(this.t, cursor);
    if (isNumberStart(this.t, endCandidate)) {
      const scanned = scanInt(this.t, endCandidate);
      endValue = scanned.value;
      end = scanned.next;
    }

    const secondColon = skipBlank(this.t, end);
    let stepValue: number | null = null;
    let next = end;
    if (this.t[secondColon] === ":") {
      const stepStart = skipBlank(this.t, secondColon + 1);
      next = secondColon + 1;
      if (isNumberStart(this.t, stepStart)) {
        const scanned = scanInt(this.t, stepStart);
        stepValue = scanned.value;
        next = scanned.next;
      }
    }

    return {
      value: {
        col: start + 1,
        kind: "slice",
        start: startValue,
        end: endValue,
        step: stepValue,
      },
      next,
    };
  }

  private orExpression(start: number, depth: number): Parsed<Expr> {
    let left = this.andExpression(start, depth);
    while (true) {
      const operator = skipBlank(this.t, left.next);
      if (this.t[operator] !== "|" || this.t[operator + 1] !== "|") {
        return left;
      }
      const rightStart = skipBlank(this.t, operator + 2);
      const right = this.andExpression(rightStart, depth);
      const expression: OrExpr = {
        col: left.value.col,
        kind: "or",
        left: left.value,
        right: right.value,
      };
      left = { value: expression, next: right.next };
    }
  }

  private andExpression(start: number, depth: number): Parsed<Expr> {
    let left = this.simpleExpression(start, depth);
    while (true) {
      const operator = skipBlank(this.t, left.next);
      if (this.t[operator] !== "&" || this.t[operator + 1] !== "&") {
        return left;
      }
      const rightStart = skipBlank(this.t, operator + 2);
      const right = this.simpleExpression(rightStart, depth);
      const expression: AndExpr = {
        col: left.value.col,
        kind: "and",
        left: left.value,
        right: right.value,
      };
      left = { value: expression, next: right.next };
    }
  }

  private simpleExpression(start: number, depth: number): Parsed<Expr> {
    const cursor = skipBlank(this.t, start);
    if (this.t[cursor] === "!") {
      const target = this.negatedTarget(skipBlank(this.t, cursor + 1), depth);
      const expression: NotExpr = {
        col: cursor + 1,
        kind: "not",
        expr: target.value,
      };
      return { value: expression, next: target.next };
    }

    if (this.t[cursor] === "(") {
      return this.parenthesized(cursor, depth);
    }

    const left = this.operand(cursor, depth);
    const operator = this.comparisonOperator(skipBlank(this.t, left.next));
    if (operator === null) {
      return left;
    }

    const rightStart = skipBlank(this.t, operator.next);
    const right = this.operand(rightStart, depth);
    const expression: ComparisonExpr = {
      col: left.value.col,
      kind: "cmp",
      op: operator.value,
      left: left.value,
      right: right.value,
    };
    return { value: expression, next: right.next };
  }

  private negatedTarget(start: number, depth: number): Parsed<Expr> {
    let cursor = skipBlank(this.t, start);
    const negationColumns: number[] = [];
    while (this.t[cursor] === "!") {
      negationColumns.push(cursor + 1);
      cursor = skipBlank(this.t, cursor + 1);
    }

    let target: Parsed<Expr>;
    if (this.t[cursor] === "(") {
      target = this.parenthesized(cursor, depth);
    } else {
      target = this.operand(cursor, depth);
    }

    for (let index = negationColumns.length - 1; index >= 0; index -= 1) {
      const col = negationColumns[index];
      if (col !== undefined) {
        const expression: NotExpr = {
          col,
          kind: "not",
          expr: target.value,
        };
        target = { value: expression, next: target.next };
      }
    }
    return target;
  }

  private parenthesized(start: number, depth: number): Parsed<ParenthesizedExpr> {
    this.checkOpen(start, depth);
    const inner = this.orExpression(skipBlank(this.t, start + 1), depth + 1);
    const close = skipBlank(this.t, inner.next);
    if (this.t[close] !== ")") {
      throw unexpected(this.t, close);
    }
    return {
      value: { col: start + 1, kind: "paren", expr: inner.value },
      next: close + 1,
    };
  }

  private operand(start: number, depth: number): Parsed<Expr> {
    const cursor = skipBlank(this.t, start);
    const character = this.t[cursor];
    if (character === undefined) {
      throw unexpected(this.t, cursor);
    }

    if (isQuote(this.t, cursor)) {
      const scanned = scanString(this.t, cursor);
      return {
        value: { col: cursor + 1, kind: "lit", value: scanned.value },
        next: scanned.next,
      };
    }

    if (isNumberStart(this.t, cursor)) {
      const scanned = scanNumber(this.t, cursor);
      return {
        value: { col: cursor + 1, kind: "lit", value: scanned.value },
        next: scanned.next,
      };
    }

    if (character === "$" || character === "@") {
      const parsed = this.query(cursor, depth);
      const expression: QueryExpr = {
        col: cursor + 1,
        kind: "query",
        query: parsed.value,
      };
      return { value: expression, next: parsed.next };
    }

    if (isIdentStart(this.t, cursor)) {
      const identifier = scanIdent(this.t, cursor);
      if (
        identifier.value === "true" ||
        identifier.value === "false" ||
        identifier.value === "null"
      ) {
        const value = identifier.value === "null" ? null : identifier.value === "true";
        return {
          value: { col: cursor + 1, kind: "lit", value },
          next: identifier.next,
        };
      }

      if (this.t[identifier.next] !== "(") {
        throw unexpected(this.t, identifier.next);
      }
      return this.call(cursor, identifier.value, identifier.next, depth);
    }

    throw unexpected(this.t, cursor);
  }

  private call(start: number, name: string, open: number, depth: number): Parsed<CallExpr> {
    this.checkOpen(open, depth);
    let cursor = skipBlank(this.t, open + 1);
    const args: Expr[] = [];
    if (this.t[cursor] === ")") {
      return {
        value: { col: start + 1, kind: "call", name, args },
        next: cursor + 1,
      };
    }

    while (true) {
      const argument = this.orExpression(cursor, depth + 1);
      args.push(argument.value);
      cursor = skipBlank(this.t, argument.next);
      if (this.t[cursor] === ")") {
        return {
          value: { col: start + 1, kind: "call", name, args },
          next: cursor + 1,
        };
      }
      if (this.t[cursor] !== ",") {
        throw unexpected(this.t, cursor);
      }
      cursor = skipBlank(this.t, cursor + 1);
    }
  }

  private comparisonOperator(start: number): Parsed<ComparisonExpr["op"]> | null {
    const first = this.t[start];
    const second = this.t[start + 1];
    if (first === "=" && second === "=") {
      return { value: "==", next: start + 2 };
    }
    if (first === "!" && second === "=") {
      return { value: "!=", next: start + 2 };
    }
    if (first === "<" && second === "=") {
      return { value: "<=", next: start + 2 };
    }
    if (first === ">" && second === "=") {
      return { value: ">=", next: start + 2 };
    }
    if (first === "<") {
      return { value: "<", next: start + 1 };
    }
    if (first === ">") {
      return { value: ">", next: start + 1 };
    }
    return null;
  }

  private checkOpen(index: number, depth: number): void {
    if (depth >= 32) {
      throw new Fault("JP009", index + 1);
    }
  }
}

export function parseQuery(text: string): Query {
  const t = codePoints(text);
  if (t[0] !== "$") {
    throw new Fault("JP001", 1);
  }

  const parsed = new Parser(t).query(0);
  if (parsed.next !== t.length) {
    const end = skipBlank(t, parsed.next);
    if (end === t.length) {
      throw unexpected(t, t.length);
    }
    throw unexpected(t, end);
  }

  checkTypes(parsed.value);
  return parsed.value;
}

export function parseSelector(
  t: readonly string[],
  i: number,
  depth: number,
): { selector: Selector; next: number } {
  const parsed = new Parser(t).selector(i, depth);
  return { selector: parsed.value, next: parsed.next };
}

export function readQuery(arg: string): Query {
  if (hasSurrogate(arg)) {
    throw new Failure(`invalid text ${show(arg)}`);
  }
  try {
    return parseQuery(arg);
  } catch (error) {
    if (error instanceof Fault) {
      throw new Failure(`query:${error.col}: ${error.code} ${error.text}`);
    }
    throw error;
  }
}
