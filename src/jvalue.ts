import { codePoints } from "./text";

export type JObject = Map<string, JValue>;
export type JValue = null | boolean | number | string | JValue[] | JObject;

export type JKind = "null" | "boolean" | "number" | "string" | "array" | "object";

export function kindOf(value: JValue): JKind {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return "object";
}

export function jsonString(text: string): string {
  let result = '"';
  for (const point of codePoints(text)) {
    const codePoint = point.codePointAt(0);
    if (point === '"') {
      result += '\\"';
    } else if (point === "\\") {
      result += "\\\\";
    } else if (point === "\b") {
      result += "\\b";
    } else if (point === "\f") {
      result += "\\f";
    } else if (point === "\n") {
      result += "\\n";
    } else if (point === "\r") {
      result += "\\r";
    } else if (point === "\t") {
      result += "\\t";
    } else if (codePoint !== undefined && codePoint < 0x20) {
      result += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else {
      result += point;
    }
  }
  return `${result}"`;
}

export function render(value: JValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") {
    return jsonString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((member) => render(member)).join(",")}]`;
  }

  const members = Array.from(value, ([key, member]) => `${jsonString(key)}:${render(member)}`);
  return `{${members.join(",")}}`;
}

export function equal(first: JValue, second: JValue): boolean {
  if (first === null || second === null) {
    return first === second;
  }
  if (typeof first !== typeof second) {
    return false;
  }
  if (typeof first === "boolean" || typeof first === "number" || typeof first === "string") {
    return first === second;
  }
  if (Array.isArray(first)) {
    if (!Array.isArray(second) || first.length !== second.length) {
      return false;
    }
    return first.every((member, index) => equal(member, second[index] ?? null));
  }
  if (!(second instanceof Map) || first.size !== second.size) {
    return false;
  }
  for (const [key, member] of first) {
    const other = second.get(key);
    if (other === undefined || !equal(member, other)) {
      return false;
    }
  }
  return true;
}
