import { expect, test } from "bun:test";
import { Fault } from "../src/fault";
import { Inputs, MemIo } from "../src/io";
import {
  scanIdent,
  scanInt,
  scanLength,
  scanName,
  scanNumber,
  scanString,
  skipBlank,
  unexpected,
} from "../src/lex";
import { codePoints } from "../src/text";

function tokens(text: string): string[] {
  const io = new MemIo(new Uint8Array(), {
    query: new TextEncoder().encode(text),
  });
  return codePoints(new Inputs(io).read("query").text);
}

function expectFault(
  run: () => unknown,
  code: string,
  col: number,
  arg: string,
  text: string,
): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Fault);
  if (caught instanceof Fault) {
    expect(caught.code).toBe(code);
    expect(caught.col).toBe(col);
    expect(caught.arg).toBe(arg);
    expect(caught.text).toBe(text);
  }
}

test.each([
  { text: " \t\n\rx", next: 4 },
  { text: String.fromCodePoint(0x00a0), next: 0 },
])("skipBlank recognizes only the four query blanks: $text", ({ text, next }) => {
  expect(skipBlank(tokens(text), 0)).toBe(next);
});

test.each([
  { text: "😀ok.", value: "😀ok", next: 3 },
  { text: `a${String.fromCodePoint(0x00a0)}`, value: `a${String.fromCodePoint(0x00a0)}`, next: 2 },
  { text: "é", value: "é", next: 1 },
])("scanName reads code-point names: $text", ({ text, value, next }) => {
  expect(scanName(tokens(text), 0)).toEqual({ value, next });
});

test("scanIdent stops before an uppercase letter", () => {
  expect(scanIdent(tokens("a1_Z"), 0)).toEqual({ value: "a1_", next: 3 });
});

test.each([
  { text: "0", result: { value: 0, next: 1 } },
  { text: "00003", result: { value: 3, next: 5 } },
  { text: "10000", result: { value: 10000, next: 5 } },
  { text: "10001", result: null },
  { text: "000000", result: null },
  { text: "", result: null },
  { text: "-1", result: null },
  { text: "1 ", result: null },
  { text: "1.0", result: null },
  { text: "1e0", result: null },
])("scanLength validates the whole input $text", ({ text, result }) => {
  expect(scanLength(tokens(text))).toEqual(result);
});

test("scanLength accepts a zero-based start and returns the first unconsumed index", () => {
  expect(scanLength(tokens("x001"), 1)).toEqual({ value: 1, next: 4 });
});

test.each([
  { text: "''", value: "", next: 2 },
  { text: '""', value: "", next: 2 },
  { text: "'abc'", value: "abc", next: 5 },
  { text: "'it\\'s'", value: "it's", next: 7 },
  { text: '"it\\"s"', value: 'it"s', next: 7 },
  { text: "'a\\/b'", value: "a/b", next: 6 },
  { text: "'\\\\'", value: "\\", next: 4 },
  { text: "'\\b\\f\\n\\r\\t'", value: "\b\f\n\r\t", next: 12 },
  { text: "'\\u0041\\u00e9\\u00E9'", value: "Aéé", next: 20 },
  { text: "'\\ud83d\\ude00'", value: "😀", next: 14 },
  { text: "'😀é'", value: "😀é", next: 4 },
])("scanString decodes $text and leaves the suffix untouched", ({ text, value, next }) => {
  expect(scanString(tokens(text), 0)).toEqual({ value, next });
});

test("scanString preserves non-ASCII blanks and invisible code points", () => {
  const characters = String.fromCodePoint(0x00a0, 0x200b, 0xfeff, 0x0085, 0x2028, 0x2029, 0x3000);
  expect(scanString(tokens(`'${characters}'`), 0)).toEqual({ value: characters, next: 9 });
});

test.each([
  { text: "'\\\"'", col: 2 },
  { text: "'\\x41'", col: 2 },
  { text: "'\\u12'", col: 2 },
  { text: "'\\u12G4'", col: 2 },
  { text: "'\\ud83d'", col: 2 },
  { text: "'\\udc00'", col: 2 },
])("scanString rejects malformed escape $text", ({ text, col }) => {
  expectFault(() => scanString(tokens(text), 0), "JP004", col, "", "bad escape");
});

test.each([
  { text: "'abc", code: "JP005", col: 1, arg: "", message: "unterminated string" },
  { text: "'a" + "\\", code: "JP005", col: 1, arg: "", message: "unterminated string" },
  { text: "'a" + "\\u12", code: "JP005", col: 1, arg: "", message: "unterminated string" },
  { text: "'a" + "\\ud83d", code: "JP005", col: 1, arg: "", message: "unterminated string" },
  { text: "'a\tb'", code: "JP002", col: 3, arg: "\t", message: 'unexpected "?"' },
  { text: "'a\rb'", code: "JP002", col: 3, arg: "\r", message: 'unexpected "?"' },
])("scanString reports exact source faults for $text", ({ text, code, col, arg, message }) => {
  expectFault(() => scanString(tokens(text), 0), code, col, arg, message);
});

test("scanString returns at its closing quote and unexpected reports the suffix", () => {
  const input = tokens("'a'b");
  expect(scanString(input, 0)).toEqual({ value: "a", next: 3 });
  expectFault(
    () => {
      throw unexpected(input, 3);
    },
    "JP002",
    4,
    "b",
    'unexpected "b"',
  );
});

test.each([
  { text: "0", value: 0, next: 1 },
  { text: "-2", value: -2, next: 2 },
  { text: "9007199254740991", value: 9007199254740991, next: 16 },
])("scanInt accepts bounded integers: $text", ({ text, value, next }) => {
  expect(scanInt(tokens(text), 0)).toEqual({ value, next });
});

test.each([
  { text: "01", code: "JP006", message: "bad number" },
  { text: "-0", code: "JP006", message: "bad number" },
  { text: "1.0", code: "JP006", message: "bad number" },
  { text: "1e2", code: "JP006", message: "bad number" },
  { text: "9007199254740992", code: "JP007", message: "number out of range" },
])("scanInt rejects $text with the exact numeric fault", ({ text, code, message }) => {
  expectFault(() => scanInt(tokens(text), 0), code, 1, "", message);
});

test.each([
  { text: "-0", value: -0, next: 2 },
  { text: "2.50", value: 2.5, next: 4 },
  { text: "1E-7", value: 0.0000001, next: 4 },
  { text: "1e+2", value: 100, next: 4 },
])("scanNumber accepts JSONPath numbers: $text", ({ text, value, next }) => {
  const result = scanNumber(tokens(text), 0);
  expect(Object.is(result.value, value)).toBe(true);
  expect(result.next).toBe(next);
});

test.each([
  { text: "1e999", code: "JP007", message: "number out of range" },
  { text: "01", code: "JP006", message: "bad number" },
  { text: "1.", code: "JP006", message: "bad number" },
  { text: "1e", code: "JP006", message: "bad number" },
  { text: "1-2", code: "JP006", message: "bad number" },
  { text: "-", code: "JP006", message: "bad number" },
])("scanNumber rejects malformed or out-of-range token $text", ({ text, code, message }) => {
  expectFault(() => scanNumber(tokens(text), 0), code, 1, "", message);
});
