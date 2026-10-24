import type { Expr, Query } from "./ast";
import { Fault } from "./fault";

export const FUNCTIONS = {
  length: { arity: 1, argument: "value", result: "value" },
  count: { arity: 1, argument: "query", result: "value" },
  value: { arity: 1, argument: "query", result: "value" },
} as const;

type Check =
  | { kind: "condition"; expr: Expr }
  | { kind: "value"; expr: Expr }
  | { kind: "query"; query: Query };

type FunctionInfo = (typeof FUNCTIONS)[keyof typeof FUNCTIONS];

function functionInfo(name: string): FunctionInfo | undefined {
  if (!Object.hasOwn(FUNCTIONS, name)) {
    return undefined;
  }
  return FUNCTIONS[name as keyof typeof FUNCTIONS];
}

export function isSingular(query: Query): boolean {
  for (const segment of query.segments) {
    if (segment.mode !== "child" || segment.selectors.length !== 1) {
      return false;
    }
    const selector = segment.selectors[0];
    if (selector.kind !== "name" && selector.kind !== "index") {
      return false;
    }
  }
  return true;
}

export function checkTypes(query: Query): void {
  const pending: Check[] = [{ kind: "query", query }];

  while (pending.length > 0) {
    const check = pending.pop();
    if (check === undefined) {
      continue;
    }

    if (check.kind === "query") {
      pushQueryFilters(pending, check.query);
      continue;
    }

    const expr = check.expr;
    if (check.kind === "condition") {
      switch (expr.kind) {
        case "query":
          pending.push({ kind: "query", query: expr.query });
          break;
        case "not":
        case "paren":
          pending.push({ kind: "condition", expr: expr.expr });
          break;
        case "cmp":
          pending.push({ kind: "value", expr: expr.right });
          pending.push({ kind: "value", expr: expr.left });
          break;
        case "and":
        case "or":
          pending.push({ kind: "condition", expr: expr.right });
          pending.push({ kind: "condition", expr: expr.left });
          break;
        case "lit":
          throw new Fault("JP013", expr.col);
        case "call":
          if (functionInfo(expr.name) === undefined) {
            throw new Fault("JP011", expr.col, expr.name);
          }
          throw new Fault("JP013", expr.col);
      }
      continue;
    }

    switch (expr.kind) {
      case "lit":
        break;
      case "query":
        if (!isSingular(expr.query)) {
          throw new Fault("JP010", expr.query.col);
        }
        pending.push({ kind: "query", query: expr.query });
        break;
      case "call":
        pushCallChecks(pending, expr.name, expr.args, expr.col);
        break;
      case "cmp":
      case "not":
      case "paren":
      case "or":
      case "and":
        throw new Fault("JP013", expr.col);
    }
  }
}

function pushQueryFilters(pending: Check[], query: Query): void {
  for (let segmentIndex = query.segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = query.segments[segmentIndex];
    if (segment === undefined) {
      continue;
    }
    for (let selectorIndex = segment.selectors.length - 1; selectorIndex >= 0; selectorIndex -= 1) {
      const selector = segment.selectors[selectorIndex];
      if (selector?.kind === "filter") {
        pending.push({ kind: "condition", expr: selector.expr });
      }
    }
  }
}

function pushCallChecks(pending: Check[], name: string, args: Expr[], col: number): void {
  const fn = functionInfo(name);
  if (fn === undefined) {
    throw new Fault("JP011", col, name);
  }
  if (args.length !== fn.arity) {
    throw new Fault("JP012", col, name);
  }

  const argument = args[0];
  if (argument === undefined) {
    throw new Fault("JP012", col, name);
  }

  if (fn.argument === "query") {
    if (argument.kind !== "query") {
      throw new Fault("JP012", col, name);
    }
    pending.push({ kind: "query", query: argument.query });
    return;
  }

  if (argument.kind === "lit") {
    return;
  }
  if (argument.kind === "query") {
    if (!isSingular(argument.query)) {
      throw new Fault("JP012", col, name);
    }
    pending.push({ kind: "query", query: argument.query });
    return;
  }
  if (argument.kind === "call") {
    pending.push({ kind: "value", expr: argument });
    return;
  }
  throw new Fault("JP012", col, name);
}
