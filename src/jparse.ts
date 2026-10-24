import type { JObject, JValue } from "./jvalue";
import { hasSurrogate, isDigit, isHex } from "./text";

export type JsonErrorReason = "syntax" | "deep" | "text";

export class JsonError extends Error {
  readonly reason: JsonErrorReason;

  constructor(reason: JsonErrorReason) {
    super(reason);
    this.name = "JsonError";
    this.reason = reason;
  }
}

class Parser {
  private cursor = 0;

  constructor(private readonly text: string) {}

  parse(): JValue {
    if (this.text.charCodeAt(0) === 0xfeff) {
      this.cursor = 1;
    }
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.cursor !== this.text.length) {
      throw new JsonError("syntax");
    }
    return value;
  }

  private parseValue(openContainers: number): JValue {
    const current = this.text.charAt(this.cursor);
    if (current === "n") {
      return this.parseWord("null", null);
    }
    if (current === "t") {
      return this.parseWord("true", true);
    }
    if (current === "f") {
      return this.parseWord("false", false);
    }
    if (current === '"') {
      return this.parseString();
    }
    if (current === "[") {
      if (openContainers >= 64) {
        throw new JsonError("deep");
      }
      return this.parseArray(openContainers + 1);
    }
    if (current === "{") {
      if (openContainers >= 64) {
        throw new JsonError("deep");
      }
      return this.parseObject(openContainers + 1);
    }
    if (current === "-" || isDigit(current)) {
      return this.parseNumber();
    }
    throw new JsonError("syntax");
  }

  private parseWord<T extends JValue>(word: string, value: T): T {
    if (this.text.slice(this.cursor, this.cursor + word.length) !== word) {
      throw new JsonError("syntax");
    }
    this.cursor += word.length;
    return value;
  }

  private parseArray(openContainers: number): JValue[] {
    this.cursor += 1;
    this.skipWhitespace();
    const values: JValue[] = [];
    if (this.text.charAt(this.cursor) === "]") {
      this.cursor += 1;
      return values;
    }
    while (true) {
      values.push(this.parseValue(openContainers));
      this.skipWhitespace();
      const separator = this.text.charAt(this.cursor);
      if (separator === "]") {
        this.cursor += 1;
        return values;
      }
      if (separator !== ",") {
        throw new JsonError("syntax");
      }
      this.cursor += 1;
      this.skipWhitespace();
    }
  }

  private parseObject(openContainers: number): JObject {
    this.cursor += 1;
    this.skipWhitespace();
    const members: JObject = new Map();
    if (this.text.charAt(this.cursor) === "}") {
      this.cursor += 1;
      return members;
    }
    while (true) {
      if (this.text.charAt(this.cursor) !== '"') {
        throw new JsonError("syntax");
      }
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text.charAt(this.cursor) !== ":") {
        throw new JsonError("syntax");
      }
      this.cursor += 1;
      this.skipWhitespace();
      members.set(key, this.parseValue(openContainers));
      this.skipWhitespace();
      const separator = this.text.charAt(this.cursor);
      if (separator === "}") {
        this.cursor += 1;
        return members;
      }
      if (separator !== ",") {
        throw new JsonError("syntax");
      }
      this.cursor += 1;
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    this.cursor += 1;
    let result = "";
    let malformed = false;
    let closed = false;
    while (this.cursor < this.text.length) {
      const current = this.text.charAt(this.cursor);
      if (current === '"') {
        this.cursor += 1;
        closed = true;
        break;
      }
      if (current === "\\") {
        this.cursor += 1;
        if (this.cursor >= this.text.length) {
          malformed = true;
          break;
        }
        const escaped = this.text.charAt(this.cursor);
        this.cursor += 1;
        switch (escaped) {
          case '"':
            result += '"';
            break;
          case "\\":
            result += "\\";
            break;
          case "/":
            result += "/";
            break;
          case "b":
            result += "\b";
            break;
          case "f":
            result += "\f";
            break;
          case "n":
            result += "\n";
            break;
          case "r":
            result += "\r";
            break;
          case "t":
            result += "\t";
            break;
          case "u": {
            const decoded = this.parseUnicodeEscape();
            if (decoded === null) {
              malformed = true;
            } else {
              result += decoded;
            }
            break;
          }
          default:
            malformed = true;
            break;
        }
        continue;
      }
      if (this.text.charCodeAt(this.cursor) < 0x20) {
        malformed = true;
      }
      result += current;
      this.cursor += 1;
    }
    if (!closed) {
      malformed = true;
    }
    if (malformed) {
      throw new JsonError("syntax");
    }
    if (hasSurrogate(result)) {
      throw new JsonError("text");
    }
    return result;
  }

  private parseUnicodeEscape(): string | null {
    let value = 0;
    for (let digitIndex = 0; digitIndex < 4; digitIndex += 1) {
      if (this.cursor >= this.text.length || this.text.charAt(this.cursor) === '"') {
        return null;
      }
      const digit = this.text.charAt(this.cursor);
      if (!isHex(digit)) {
        this.cursor += 1;
        return null;
      }
      value = value * 16 + this.hexValue(digit);
      this.cursor += 1;
    }
    return String.fromCharCode(value);
  }

  private hexValue(digit: string): number {
    const code = digit.charCodeAt(0);
    if (code >= 0x30 && code <= 0x39) {
      return code - 0x30;
    }
    if (code >= 0x41 && code <= 0x46) {
      return code - 0x41 + 10;
    }
    return code - 0x61 + 10;
  }

  private parseNumber(): number {
    const start = this.cursor;
    if (this.text.charAt(this.cursor) === "-") {
      this.cursor += 1;
    }
    if (this.text.charAt(this.cursor) === "0") {
      this.cursor += 1;
    } else if (this.isNonzeroDigit(this.text.charAt(this.cursor))) {
      this.cursor += 1;
      while (isDigit(this.text.charAt(this.cursor))) {
        this.cursor += 1;
      }
    } else {
      throw new JsonError("syntax");
    }
    if (this.text.charAt(this.cursor) === ".") {
      this.cursor += 1;
      if (!isDigit(this.text.charAt(this.cursor))) {
        throw new JsonError("syntax");
      }
      while (isDigit(this.text.charAt(this.cursor))) {
        this.cursor += 1;
      }
    }
    const exponent = this.text.charAt(this.cursor);
    if (exponent === "e" || exponent === "E") {
      this.cursor += 1;
      const sign = this.text.charAt(this.cursor);
      if (sign === "+" || sign === "-") {
        this.cursor += 1;
      }
      if (!isDigit(this.text.charAt(this.cursor))) {
        throw new JsonError("syntax");
      }
      while (isDigit(this.text.charAt(this.cursor))) {
        this.cursor += 1;
      }
    }
    const number = Number(this.text.slice(start, this.cursor));
    if (!Number.isFinite(number)) {
      throw new JsonError("syntax");
    }
    return number;
  }

  private isNonzeroDigit(value: string): boolean {
    return value >= "1" && value <= "9";
  }

  private skipWhitespace(): void {
    while (true) {
      const current = this.text.charAt(this.cursor);
      if (current === " " || current === "\t" || current === "\n" || current === "\r") {
        this.cursor += 1;
      } else {
        return;
      }
    }
  }
}

export function parseJson(text: string): JValue {
  return new Parser(text).parse();
}
