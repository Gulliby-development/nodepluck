import { expect, test } from "bun:test";
import { Failure } from "../src/fault";
import { Inputs, MemIo } from "../src/io";
import { JsonError, parseJson } from "../src/jparse";
import { equal, jsonString, kindOf, render } from "../src/jvalue";
import { loadDocument } from "../src/load";

function source(text: string) {
  const io = new MemIo(new Uint8Array(), { "doc.json": new TextEncoder().encode(text) });
  return new Inputs(io).read("doc.json");
}

function document(text: string) {
  return loadDocument(source(text));
}

function expectReason(text: string, reason: "syntax" | "deep" | "text"): void {
  let actual: JsonError | undefined;
  try {
    parseJson(source(text).text);
  } catch (error) {
    if (error instanceof JsonError) {
      actual = error;
    }
  }
  expect(actual).toBeInstanceOf(JsonError);
  expect(actual?.reason).toBe(reason);
}

function failureMessage(text: string): string {
  try {
    loadDocument(source(text));
  } catch (error) {
    if (error instanceof Failure) {
      return error.message;
    }
    throw error;
  }
  throw new Error("expected a document failure");
}

test.each([
  { input: "null", kind: "null" },
  { input: "true", kind: "boolean" },
  { input: "1", kind: "number" },
  { input: '"x"', kind: "string" },
  { input: "[]", kind: "array" },
  { input: "{}", kind: "object" },
])("classifies $input as $kind", ({ input, kind }) => {
  expect(kindOf(document(input))).toBe(kind);
});

test("keeps object member order and a duplicate's first position with its last value", () => {
  const ordered = document('{"b":1,"a":2,"10":3,"2":4}');
  const duplicate = document('{"10":1,"2":2,"10":3}');
  expect(ordered instanceof Map ? Array.from(ordered.entries()) : []).toEqual([
    ["b", 1],
    ["a", 2],
    ["10", 3],
    ["2", 4],
  ]);
  expect(render(ordered)).toBe('{"b":1,"a":2,"10":3,"2":4}');
  expect(duplicate instanceof Map ? Array.from(duplicate.entries()) : []).toEqual([
    ["10", 3],
    ["2", 2],
  ]);
  expect(render(duplicate)).toBe('{"10":3,"2":2}');
});

test.each([
  {
    input: "[1,2.50,-0,1e2,1E-7,1e21,0.1]",
    expected: "[1,2.5,0,100,1e-7,1e+21,0.1]",
  },
  { input: '{"x":[true,false,null,{ }]}', expected: '{"x":[true,false,null,{}]}' },
])("renders compact JSON $input", ({ input, expected }) => {
  expect(render(document(input))).toBe(expected);
});

test("escapes JSON strings exactly and preserves valid Unicode raw", () => {
  const escapedInput = String.raw`"\"\\\/\b\f\n\r\t\u0000\u001f"`;
  const escapedExpected = String.raw`"\"\\/\b\f\n\r\t\u0000\u001f"`;
  const escaped = document(escapedInput);
  const unicodeInput = '"é😀\\u007f\\u0085\\u00a0\\u2028\\u2029\\u3000\\ufeff\\u200b"';
  const unicodeExpected = '"é😀\u007f\u0085\u00a0\u2028\u2029\u3000\ufeff\u200b"';
  expect(render(escaped)).toBe(escapedExpected);
  if (typeof escaped === "string") {
    expect(jsonString(escaped)).toBe(escapedExpected);
  }
  expect(render(document(unicodeInput))).toBe(unicodeExpected);
  const empty = document('""');
  expect(render(empty)).toBe('""');
  if (typeof empty === "string") {
    expect(jsonString(empty)).toBe('""');
  }
});

test.each([
  { first: '{"a":1,"b":[2]}', second: '{"b":[2],"a":1}', expected: true },
  { first: "[1,2]", second: "[2,1]", expected: false },
  { first: "-0", second: "0", expected: true },
  { first: "1", second: '"1"', expected: false },
  { first: "null", second: "false", expected: false },
  { first: '{"a":null}', second: "{}", expected: false },
  { first: '{"a":[1]}', second: '{"a":[2]}', expected: false },
  { first: '"😀"', second: '"😀"', expected: true },
  { first: "true", second: "false", expected: false },
])("compares $first and $second structurally", ({ first, second, expected }) => {
  expect(equal(document(first), document(second))).toBe(expected);
});

test.each([
  { input: ' \r\n\t{"a":\t1}\r\n', expected: '{"a":1}' },
  { input: '\uFEFF{"a":1}', expected: '{"a":1}' },
  { input: "[0,-0,12,-12,2.50,1e2,1E-7,1e+21]", expected: "[0,0,12,-12,2.5,100,1e-7,1e+21]" },
])("parses valid JSON document $input", ({ input, expected }) => {
  expect(render(document(input))).toBe(expected);
});

test.each([
  "",
  '{"a":1,}',
  "[1,]",
  "{'a':1}",
  "NaN",
  "01",
  "+1",
  "1.",
  "1e",
  "1e+",
  "1e999",
  "true false",
  '{"a":}',
  "\uFEFF\uFEFF{}",
  " \uFEFF{}",
  "\u00A0{}",
  "[]\uFEFF",
])("rejects malformed JSON document %s as syntax", (input) => {
  expectReason(input, "syntax");
});

test.each([
  { input: String.raw`"\u0041\u00e9\u00E9"`, expected: "Aéé" },
  { input: String.raw`"\ud83d\ude00"`, expected: "😀" },
  { input: String.raw`{"\ud83d\ude00":"\ud83d\ude00"}`, expected: '{"😀":"😀"}' },
  { input: String.raw`"a\\b\/c"`, expected: "a\\b/c" },
  { input: String.raw`"\b\f\n\r\t"`, expected: "\b\f\n\r\t" },
])("decodes JSON string escapes in $input", ({ input, expected }) => {
  const value = document(input);
  if (typeof value === "string") {
    expect(value).toBe(expected);
  } else {
    expect(render(value)).toBe(expected);
  }
});

test.each([
  { input: String.raw`"\ud800"`, reason: "text" },
  { input: String.raw`"\udc00"`, reason: "text" },
  { input: String.raw`{"\ud800":1}`, reason: "text" },
  { input: String.raw`"\x41"`, reason: "syntax" },
  { input: '"\\u12G4"', reason: "syntax" },
  { input: '"\\u12"', reason: "syntax" },
  { input: String.raw`"\'"`, reason: "syntax" },
  { input: String.raw`"\ud800\x41"`, reason: "syntax" },
  { input: String.raw`"\x41\ud800"`, reason: "syntax" },
  { input: String.raw`"\ud800`, reason: "syntax" },
  { input: '"abc', reason: "syntax" },
  { input: String.raw`["\ud800",]`, reason: "text" },
  { input: '"a\tb"', reason: "syntax" },
])("reports $reason for JSON string input $input", ({ input, reason }) => {
  expectReason(input, reason);
});

test("rejects a raw unpaired UTF-16 surrogate after MemIo source acquisition", () => {
  const validSourceText = source('""').text;
  expect(validSourceText).toBe('""');
  const raw = `${validSourceText.charAt(0)}\uD800${validSourceText.charAt(1)}`;
  let actual: JsonError | undefined;
  try {
    parseJson(raw);
  } catch (error) {
    if (error instanceof JsonError) {
      actual = error;
    }
  }
  expect(actual).toBeInstanceOf(JsonError);
  expect(actual?.reason).toBe("text");
});

test("accepts 64 mixed containers and rejects the 65th before its malformed contents", () => {
  const depth64 = `{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
null
]}]}]}]}]}]}]}]}
]}]}]}]}]}]}]}]}
]}]}]}]}]}]}]}]}
]}]}]}]}]}]}]}]}`;
  const depth65 = `{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[{"a":[
[
?
`;
  expect(kindOf(document(depth64))).toBe("object");
  expectReason(depth65, "deep");
});

test.each([
  { input: '{"a":1}', expected: '{"a":1}' },
  { input: '{"a":}', expected: "doc.json: not valid JSON" },
  { input: String.raw`"\ud800"`, expected: "doc.json: invalid text" },
])("loads a document or translates its parser error: $input", ({ input, expected }) => {
  if (input === '{"a":1}') {
    expect(render(document(input))).toBe(expected);
  } else {
    expect(failureMessage(input)).toBe(expected);
  }
});

test("uses the unchanged stdin display and leaves MemIo output untouched on failure", () => {
  const io = new MemIo(new TextEncoder().encode(""));
  const input = new Inputs(io).read("-");
  let failure: Failure | undefined;
  try {
    loadDocument(input);
  } catch (error) {
    if (error instanceof Failure) {
      failure = error;
    }
  }
  expect(failure?.message).toBe("<stdin>: not valid JSON");
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
});
