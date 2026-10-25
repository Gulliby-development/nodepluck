import { codePoints } from "./text";

/**
 * A normalized path component: a member name or a nonnegative array index.
 * Names are Unicode scalar-value strings; numbers are actual array indexes.
 */
export type PathComponent = string | number;

/**
 * Quote a member name as a path literal in single quotes (the default) or double
 * quotes, escaping the quote mark, backslashes, and control characters while
 * preserving other Unicode code points.
 */
export function quoteName(text: string, mark: "'" | '"' = "'"): string {
  let quoted: string = mark;
  for (const point of codePoints(text)) {
    const code = point.codePointAt(0);
    if (point === mark) {
      quoted += `\\${mark}`;
    } else if (point === "\\") {
      quoted += "\\\\";
    } else if (point === "\b") {
      quoted += "\\b";
    } else if (point === "\f") {
      quoted += "\\f";
    } else if (point === "\n") {
      quoted += "\\n";
    } else if (point === "\r") {
      quoted += "\\r";
    } else if (point === "\t") {
      quoted += "\\t";
    } else if (code !== undefined && code <= 0x1f) {
      quoted += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      quoted += point;
    }
  }
  return `${quoted}${mark}`;
}

/** Render components in order as a '$'-rooted normalized path. */
export function normalized(path: readonly PathComponent[]): string {
  let result = "$";
  for (const component of path) {
    if (typeof component === "string") {
      result += `[${quoteName(component)}]`;
    } else {
      result += `[${component}]`;
    }
  }
  return result;
}
