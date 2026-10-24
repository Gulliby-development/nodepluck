import { equal, type JValue } from "./jvalue";
import { codePoints } from "./text";

export const NOTHING: unique symbol = Symbol("NOTHING");

export type Operand = JValue | typeof NOTHING;
export type ComparisonOperator = "==" | "!=" | "<" | ">" | "<=" | ">=";

export function lessString(first: string, second: string): boolean {
  const firstPoints = codePoints(first);
  const secondPoints = codePoints(second);
  const sharedLength = Math.min(firstPoints.length, secondPoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const firstCodePoint = firstPoints[index]?.codePointAt(0);
    const secondCodePoint = secondPoints[index]?.codePointAt(0);
    if (firstCodePoint !== secondCodePoint) {
      return (
        firstCodePoint !== undefined &&
        secondCodePoint !== undefined &&
        firstCodePoint < secondCodePoint
      );
    }
  }

  return firstPoints.length < secondPoints.length;
}

export function same(first: Operand, second: Operand): boolean {
  if (first === NOTHING || second === NOTHING) {
    return first === second;
  }
  return equal(first, second);
}

export function less(first: Operand, second: Operand): boolean {
  if (typeof first === "number" && typeof second === "number") {
    return first < second;
  }
  if (typeof first === "string" && typeof second === "string") {
    return lessString(first, second);
  }
  return false;
}

export function compare(operator: ComparisonOperator, first: Operand, second: Operand): boolean {
  switch (operator) {
    case "==":
      return same(first, second);
    case "!=":
      return !same(first, second);
    case "<":
      return less(first, second);
    case ">":
      return less(second, first);
    case "<=":
      return less(first, second) || same(first, second);
    case ">=":
      return less(second, first) || same(first, second);
  }
}
