import type { Expr, Query, Selector } from "./ast";
import { type Problem, sortedProblems } from "./problem";

export function findProblems(query: Query): Problem[] {
  const found: Problem[] = [];
  const pending: Array<{ kind: "query"; query: Query } | { kind: "expr"; expr: Expr }> = [
    { kind: "query", query },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      continue;
    }

    if (current.kind === "query") {
      for (const segment of current.query.segments) {
        inspectSelectors(segment.selectors, found, pending);
      }
      continue;
    }

    const expr = current.expr;
    switch (expr.kind) {
      case "lit":
        break;
      case "query":
        pending.push({ kind: "query", query: expr.query });
        break;
      case "call":
        for (let index = expr.args.length - 1; index >= 0; index -= 1) {
          const argument = expr.args[index];
          if (argument !== undefined) {
            pending.push({ kind: "expr", expr: argument });
          }
        }
        break;
      case "cmp":
        if (expr.left.kind === "lit" && expr.right.kind === "lit") {
          found.push({
            col: expr.left.col,
            code: "JP103",
            text: "comparison of two literals",
          });
        }
        pending.push({ kind: "expr", expr: expr.right });
        pending.push({ kind: "expr", expr: expr.left });
        break;
      case "not":
      case "paren":
        pending.push({ kind: "expr", expr: expr.expr });
        break;
      case "or":
      case "and":
        pending.push({ kind: "expr", expr: expr.right });
        pending.push({ kind: "expr", expr: expr.left });
        break;
    }
  }

  return sortedProblems(found);
}

function inspectSelectors(
  selectors: Selector[],
  found: Problem[],
  pending: Array<{ kind: "query"; query: Query } | { kind: "expr"; expr: Expr }>,
): void {
  const names = new Set<string>();
  const indexes = new Set<number>();
  let hasWildcard = false;

  for (const selector of selectors) {
    if (selector.kind === "name") {
      if (names.has(selector.name)) {
        found.push({
          col: selector.col,
          code: "JP101",
          text: "repeated selector",
        });
      } else {
        names.add(selector.name);
      }
      continue;
    }

    if (selector.kind === "index") {
      if (indexes.has(selector.index)) {
        found.push({
          col: selector.col,
          code: "JP101",
          text: "repeated selector",
        });
      } else {
        indexes.add(selector.index);
      }
      continue;
    }

    if (selector.kind === "wild") {
      if (hasWildcard) {
        found.push({
          col: selector.col,
          code: "JP101",
          text: "repeated selector",
        });
      } else {
        hasWildcard = true;
      }
      continue;
    }

    if (selector.kind === "slice") {
      if (selector.step === 0) {
        found.push({
          col: selector.col,
          code: "JP102",
          text: "step 0 selects nothing",
        });
      } else if (
        selector.start !== null &&
        selector.end !== null &&
        selector.start >= 0 &&
        selector.end >= 0 &&
        (selector.step === null || selector.step > 0
          ? selector.start >= selector.end
          : selector.start <= selector.end)
      ) {
        found.push({
          col: selector.col,
          code: "JP104",
          text: "slice selects nothing",
        });
      }
      continue;
    }

    pending.push({ kind: "expr", expr: selector.expr });
  }
}
