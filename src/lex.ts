import { Fault } from "./fault";
import { isAlpha, isDigit, isHex } from "./text";

export type ScanResult<T> = { value: T; next: number };

function pointCode(t: readonly string[], i: number): number | undefined {
  return t[i]?.codePointAt(0);
}

function isLower(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const code = value.codePointAt(0);
  return code !== undefined && code >= 0x61 && code <= 0x7a;
}

function isNameContinuation(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const code = value.codePointAt(0);
  return (code !== undefined && code >= 0x80) || isAlpha(value) || isDigit(value) || value === "_";
}

function isIdentifierContinuation(value: string | undefined): boolean {
  return isLower(value) || (value !== undefined && isDigit(value)) || value === "_";
}

function isNumericContinuation(value: string | undefined): boolean {
  return (
    (value !== undefined && isDigit(value)) ||
    value === "." ||
    value === "e" ||
    value === "E" ||
    value === "+" ||
    value === "-"
  );
}

function isNumericStart(value: string | undefined): boolean {
  return (value !== undefined && isDigit(value)) || value === "-";
}

function fault(code: "JP004" | "JP005" | "JP006" | "JP007", col: number): never {
  throw new Fault(code, col);
}

function tokenEnd(t: readonly string[], i: number): number {
  let next = i;
  while (next < t.length && isNumericContinuation(t[next])) {
    next += 1;
  }
  return next;
}

function tokenText(t: readonly string[], i: number, next: number): string {
  return t.slice(i, next).join("");
}

export function skipBlank(t: readonly string[], i: number): number {
  let next = i;
  while (
    next < t.length &&
    (t[next] === " " || t[next] === "\t" || t[next] === "\n" || t[next] === "\r")
  ) {
    next += 1;
  }
  return next;
}

export function unexpected(t: readonly string[], i: number): Fault {
  return i >= t.length ? new Fault("JP003", t.length + 1) : new Fault("JP002", i + 1, t[i]);
}

export function isQuote(t: readonly string[], i: number): boolean {
  return t[i] === "'" || t[i] === '"';
}

export function isNumberStart(t: readonly string[], i: number): boolean {
  return isNumericStart(t[i]);
}

export function isNameStart(t: readonly string[], i: number): boolean {
  const value = t[i];
  if (value === undefined) {
    return false;
  }
  const code = pointCode(t, i);
  return value === "_" || isAlpha(value) || (code !== undefined && code >= 0x80);
}

export function isIdentStart(t: readonly string[], i: number): boolean {
  return isLower(t[i]);
}

export function scanString(t: readonly string[], i: number): ScanResult<string> {
  const quote = t[i];
  if (quote !== "'" && quote !== '"') {
    throw unexpected(t, i);
  }

  let next = i + 1;
  let value = "";
  while (next < t.length) {
    const current = t[next] ?? "";
    if (current === quote) {
      return { value, next: next + 1 };
    }

    const code = current.codePointAt(0);
    if (code !== undefined && code < 0x20) {
      throw unexpected(t, next);
    }

    if (current !== "\\") {
      value += current;
      next += 1;
      continue;
    }

    const slash = next;
    next += 1;
    const escapeCode = t[next];
    if (escapeCode === undefined) {
      fault("JP005", i + 1);
    }
    if (escapeCode === "b") {
      value += "\b";
      next += 1;
    } else if (escapeCode === "f") {
      value += "\f";
      next += 1;
    } else if (escapeCode === "n") {
      value += "\n";
      next += 1;
    } else if (escapeCode === "r") {
      value += "\r";
      next += 1;
    } else if (escapeCode === "t") {
      value += "\t";
      next += 1;
    } else if (escapeCode === "/") {
      value += "/";
      next += 1;
    } else if (escapeCode === "\\") {
      value += "\\";
      next += 1;
    } else if (escapeCode === quote) {
      value += quote;
      next += 1;
    } else if (escapeCode === "u") {
      const decoded = scanUnicodeEscape(t, slash, i);
      value += decoded.value;
      next = decoded.next;
    } else {
      fault("JP004", slash + 1);
    }
  }

  fault("JP005", i + 1);
}

function scanUnicodeEscape(
  t: readonly string[],
  slash: number,
  quoteStart: number,
): ScanResult<string> {
  const first = readHexEscape(t, slash, quoteStart);
  if (first.value >= 0xdc00 && first.value <= 0xdfff) {
    fault("JP004", slash + 1);
  }
  if (first.value < 0xd800 || first.value > 0xdbff) {
    return { value: String.fromCharCode(first.value), next: first.next };
  }

  const low = readHexEscape(t, first.next, quoteStart, slash);
  if (low.value < 0xdc00 || low.value > 0xdfff) {
    fault("JP004", slash + 1);
  }
  const codePoint = 0x10000 + (first.value - 0xd800) * 0x400 + low.value - 0xdc00;
  return { value: String.fromCodePoint(codePoint), next: low.next };
}

function readHexEscape(
  t: readonly string[],
  slash: number,
  quoteStart: number,
  errorSlash = slash,
): ScanResult<number> {
  if (t[slash] === undefined || (t[slash] === "\\" && t[slash + 1] === undefined)) {
    fault("JP005", quoteStart + 1);
  }
  if (t[slash] !== "\\" || t[slash + 1] !== "u") {
    fault("JP004", errorSlash + 1);
  }
  let value = 0;
  for (let offset = 2; offset < 6; offset += 1) {
    const digit = t[slash + offset];
    if (digit === undefined) {
      fault("JP005", quoteStart + 1);
    }
    if (!isHex(digit)) {
      fault("JP004", errorSlash + 1);
    }
    value = value * 16 + hexValue(digit);
  }
  return { value, next: slash + 6 };
}

function hexValue(value: string): number {
  const code = value.codePointAt(0);
  if (code === undefined) {
    return 0;
  }
  if (code >= 0x30 && code <= 0x39) {
    return code - 0x30;
  }
  if (code >= 0x41 && code <= 0x46) {
    return code - 0x41 + 10;
  }
  return code - 0x61 + 10;
}

export function scanName(t: readonly string[], i: number): ScanResult<string> {
  if (!isNameStart(t, i)) {
    throw unexpected(t, i);
  }
  let next = i + 1;
  while (next < t.length && isNameContinuation(t[next])) {
    next += 1;
  }
  return { value: tokenText(t, i, next), next };
}

export function scanIdent(t: readonly string[], i: number): ScanResult<string> {
  if (!isIdentStart(t, i)) {
    throw unexpected(t, i);
  }
  let next = i + 1;
  while (next < t.length && isIdentifierContinuation(t[next])) {
    next += 1;
  }
  return { value: tokenText(t, i, next), next };
}

export function scanInt(t: readonly string[], i: number): ScanResult<number> {
  if (!isNumericStart(t[i])) {
    throw unexpected(t, i);
  }
  const next = tokenEnd(t, i);
  const token = tokenText(t, i, next);
  let cursor = i;
  if (t[cursor] === "-") {
    cursor += 1;
  }
  if (cursor >= next) {
    fault("JP006", i + 1);
  }
  if (t[cursor] === "0") {
    cursor += 1;
    if (cursor !== next || t[i] === "-") {
      fault("JP006", i + 1);
    }
  } else {
    if (!isNonzeroDigit(t[cursor])) {
      fault("JP006", i + 1);
    }
    cursor += 1;
    while (cursor < next && isDigit(t[cursor] ?? "")) {
      cursor += 1;
    }
    if (cursor !== next) {
      fault("JP006", i + 1);
    }
  }
  const value = Number(token);
  if (!Number.isSafeInteger(value)) {
    fault("JP007", i + 1);
  }
  return { value, next };
}

export function scanNumber(t: readonly string[], i: number): ScanResult<number> {
  if (!isNumericStart(t[i])) {
    throw unexpected(t, i);
  }
  const next = tokenEnd(t, i);
  const token = tokenText(t, i, next);
  let cursor = i;
  if (t[cursor] === "-") {
    cursor += 1;
  }
  if (cursor >= next) {
    fault("JP006", i + 1);
  }

  if (t[cursor] === "0") {
    cursor += 1;
    if (cursor < next && isDigit(t[cursor] ?? "")) {
      fault("JP006", i + 1);
    }
  } else {
    if (!isNonzeroDigit(t[cursor])) {
      fault("JP006", i + 1);
    }
    cursor += 1;
    while (cursor < next && isDigit(t[cursor] ?? "")) {
      cursor += 1;
    }
  }

  if (cursor < next && t[cursor] === ".") {
    cursor += 1;
    if (cursor >= next || !isDigit(t[cursor] ?? "")) {
      fault("JP006", i + 1);
    }
    while (cursor < next && isDigit(t[cursor] ?? "")) {
      cursor += 1;
    }
  }

  if (cursor < next && (t[cursor] === "e" || t[cursor] === "E")) {
    cursor += 1;
    if (t[cursor] === "+" || t[cursor] === "-") {
      cursor += 1;
    }
    if (cursor >= next || !isDigit(t[cursor] ?? "")) {
      fault("JP006", i + 1);
    }
    while (cursor < next && isDigit(t[cursor] ?? "")) {
      cursor += 1;
    }
  }

  if (cursor !== next) {
    fault("JP006", i + 1);
  }
  const value = Number(token);
  if (!Number.isFinite(value)) {
    fault("JP007", i + 1);
  }
  return { value, next };
}

function isNonzeroDigit(value: string | undefined): boolean {
  return value !== undefined && isDigit(value) && value !== "0";
}

export function scanLength(t: readonly string[], i = 0): ScanResult<number> | null {
  if (i >= t.length || t.length - i > 5) {
    return null;
  }
  let value = 0;
  for (let cursor = i; cursor < t.length; cursor += 1) {
    const digit = t[cursor];
    if (digit === undefined || !isDigit(digit)) {
      return null;
    }
    value = value * 10 + (digit.codePointAt(0) ?? 0) - 0x30;
    if (value > 10000) {
      return null;
    }
  }
  return { value, next: t.length };
}
