import type { Expr, Query, Selector } from "./ast";
import { compare, NOTHING, type Operand } from "./compare";
import { Failure } from "./fault";
import type { JObject, JValue } from "./jvalue";
import type { PathComponent } from "./npath";
import { sliceIndexes } from "./slice";
import { codePoints } from "./text";

export interface Node {
  value: JValue;
  path: PathComponent[];
}

const MAX_NODES = 10000;

export function select(query: Query, doc: JValue): Node[] {
  const root: Node = { value: doc, path: [] };
  return evaluateQuery(query, root, root);
}

function evaluateQuery(query: Query, root: Node, current: Node): Node[] {
  let nodes = [query.root === "$" ? root : current];

  for (const segment of query.segments) {
    const next: Node[] = [];
    if (segment.mode === "child") {
      for (const input of nodes) {
        for (const selector of segment.selectors) {
          applySelector(selector, input, root, next);
        }
      }
    } else {
      for (const input of nodes) {
        visitDescendants(input, (visited) => {
          for (const selector of segment.selectors) {
            applySelector(selector, visited, root, next);
          }
        });
      }
    }
    nodes = next;
  }

  return nodes;
}

function append(nodes: Node[], node: Node): void {
  if (nodes.length >= MAX_NODES) {
    throw new Failure("too many nodes");
  }
  nodes.push(node);
}

function child(parent: Node, component: PathComponent, value: JValue): Node {
  return { value, path: [...parent.path, component] };
}

function isObject(value: JValue): value is JObject {
  return value instanceof Map;
}

function forEachChild(node: Node, visit: (childNode: Node) => void): void {
  if (Array.isArray(node.value)) {
    for (let index = 0; index < node.value.length; index += 1) {
      const value = node.value[index];
      if (value !== undefined) {
        visit(child(node, index, value));
      }
    }
  } else if (isObject(node.value)) {
    for (const [name, value] of node.value) {
      visit(child(node, name, value));
    }
  }
}

function visitDescendants(node: Node, visit: (descendant: Node) => void): void {
  visit(node);
  forEachChild(node, (childNode) => visitDescendants(childNode, visit));
}

function applySelector(selector: Selector, input: Node, root: Node, output: Node[]): void {
  switch (selector.kind) {
    case "name": {
      if (isObject(input.value) && input.value.has(selector.name)) {
        const value = input.value.get(selector.name);
        if (value !== undefined) {
          append(output, child(input, selector.name, value));
        }
      }
      return;
    }
    case "wild":
      forEachChild(input, (childNode) => append(output, childNode));
      return;
    case "index": {
      if (Array.isArray(input.value)) {
        const index = selector.index < 0 ? input.value.length + selector.index : selector.index;
        const value = input.value[index];
        if (index >= 0 && index < input.value.length && value !== undefined) {
          append(output, child(input, index, value));
        }
      }
      return;
    }
    case "slice":
      if (Array.isArray(input.value)) {
        for (const index of sliceIndexes(
          selector.start,
          selector.end,
          selector.step,
          input.value.length,
        )) {
          const value = input.value[index];
          if (value !== undefined) {
            append(output, child(input, index, value));
          }
        }
      }
      return;
    case "filter":
      forEachChild(input, (candidate) => {
        if (evaluateCondition(selector.expr, root, candidate)) {
          append(output, candidate);
        }
      });
      return;
  }
}

function evaluateOperand(expr: Expr, root: Node, current: Node): Operand {
  switch (expr.kind) {
    case "lit":
      return expr.value;
    case "query": {
      const matches = evaluateQuery(expr.query, root, current);
      if (matches.length !== 1) {
        return NOTHING;
      }
      const match = matches[0];
      return match === undefined ? NOTHING : match.value;
    }
    case "call":
      return evaluateCall(expr, root, current);
    default:
      return NOTHING;
  }
}

function evaluateCall(expr: Extract<Expr, { kind: "call" }>, root: Node, current: Node): Operand {
  const argument = expr.args[0];
  if (argument === undefined) {
    return NOTHING;
  }

  if (expr.name === "length") {
    const value = evaluateOperand(argument, root, current);
    if (typeof value === "string") {
      return codePoints(value).length;
    }
    if (Array.isArray(value)) {
      return value.length;
    }
    if (value !== NOTHING && isObject(value)) {
      return value.size;
    }
    return NOTHING;
  }

  if (argument.kind !== "query") {
    return NOTHING;
  }
  const matches = evaluateQuery(argument.query, root, current);
  if (expr.name === "count") {
    return matches.length;
  }
  if (expr.name === "value") {
    if (matches.length !== 1) {
      return NOTHING;
    }
    const match = matches[0];
    return match === undefined ? NOTHING : match.value;
  }
  return NOTHING;
}

function evaluateCondition(expr: Expr, root: Node, current: Node): boolean {
  switch (expr.kind) {
    case "query":
      return evaluateQuery(expr.query, root, current).length > 0;
    case "cmp":
      return compare(
        expr.op,
        evaluateOperand(expr.left, root, current),
        evaluateOperand(expr.right, root, current),
      );
    case "not":
      return !evaluateCondition(expr.expr, root, current);
    case "paren":
      return evaluateCondition(expr.expr, root, current);
    case "or":
      return (
        evaluateCondition(expr.left, root, current) || evaluateCondition(expr.right, root, current)
      );
    case "and":
      return (
        evaluateCondition(expr.left, root, current) && evaluateCondition(expr.right, root, current)
      );
    case "lit":
    case "call":
      return false;
  }
}
