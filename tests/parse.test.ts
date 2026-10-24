import { expect, test } from "bun:test";
import type { Query, Selector } from "../src/ast";
import { Failure, Fault } from "../src/fault";
import { Inputs, MemIo } from "../src/io";
import { parseQuery, parseSelector, readQuery } from "../src/parse";
import { codePoints } from "../src/text";

function parseFromMemory(text: string): Query {
  const io = new MemIo(new TextEncoder().encode(text));
  return parseQuery(new Inputs(io).read("-").text);
}

function selectorFromMemory(text: string, depth: number): { selector: Selector; next: number } {
  const io = new MemIo(new TextEncoder().encode(text));
  const points = codePoints(new Inputs(io).read("-").text);
  return parseSelector(points, 0, depth);
}

function argumentFromMemory(arg: string): Query {
  const io = new MemIo();
  io.out(arg);
  return readQuery(io.stdout);
}

function faultFromMemory(text: string): Fault {
  try {
    parseFromMemory(text);
  } catch (error) {
    if (error instanceof Fault) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected a query Fault");
}

function failureFromMemory(arg: string): Failure {
  try {
    argumentFromMemory(arg);
  } catch (error) {
    if (error instanceof Failure) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected a query Failure");
}

const basicQueries: Array<{
  query: string;
  root: Query["root"];
  segments: Query["segments"];
}> = [
  { query: "$", root: "$", segments: [] },
  {
    query: "$.a",
    root: "$",
    segments: [{ col: 2, mode: "child", selectors: [{ col: 3, kind: "name", name: "a" }] }],
  },
];

test.each(basicQueries)(
  "parses root and basic child structure: $query",
  ({ query, root, segments }) => {
    const parsed = parseFromMemory(query);
    expect(parsed.root).toBe(root);
    expect(parsed.col).toBe(1);
    expect(parsed.segments).toEqual(segments);
  },
);

test("preserves the corrected code-point columns and mixed selector order", () => {
  const parsed = parseFromMemory("$.😀ok[0,'x',*,1::2]");
  expect(parsed).toEqual({
    col: 1,
    root: "$",
    segments: [
      {
        col: 2,
        mode: "child",
        selectors: [{ col: 3, kind: "name", name: "😀ok" }],
      },
      {
        col: 6,
        mode: "child",
        selectors: [
          { col: 7, kind: "index", index: 0 },
          { col: 9, kind: "name", name: "x" },
          { col: 13, kind: "wild" },
          { col: 15, kind: "slice", start: 1, end: null, step: 2 },
        ],
      },
    ],
  });
});

test("records descendant segment and selector columns", () => {
  const parsed = parseFromMemory("$..a..[*]");
  expect(parsed.segments).toEqual([
    {
      col: 2,
      mode: "descendant",
      selectors: [{ col: 4, kind: "name", name: "a" }],
    },
    {
      col: 5,
      mode: "descendant",
      selectors: [{ col: 8, kind: "wild" }],
    },
  ]);
});

test.each([
  { query: "$[:]", slice: { col: 3, kind: "slice", start: null, end: null, step: null } },
  { query: "$[::0]", slice: { col: 3, kind: "slice", start: null, end: null, step: 0 } },
])("distinguishes omitted and explicit slice fields: $query", ({ query, slice }) => {
  expect(parseFromMemory(query).segments[0]?.selectors).toEqual([slice]);
});

test.each([
  { query: "", code: "JP001", col: 1, arg: "", text: 'query must start with "$"' },
  { query: " $", code: "JP001", col: 1, arg: "", text: 'query must start with "$"' },
  { query: "@", code: "JP001", col: 1, arg: "", text: 'query must start with "$"' },
  { query: "$.a ", code: "JP003", col: 5, arg: "", text: "unexpected end" },
  { query: "$..", code: "JP003", col: 4, arg: "", text: "unexpected end" },
  { query: "$...a", code: "JP002", col: 4, arg: ".", text: 'unexpected "."' },
  { query: "$. a", code: "JP002", col: 3, arg: " ", text: 'unexpected " "' },
  { query: "$\u00a0.a", code: "JP002", col: 2, arg: "\u00a0", text: 'unexpected "?"' },
  { query: "$[", code: "JP003", col: 3, arg: "", text: "unexpected end" },
  { query: "$[]", code: "JP002", col: 3, arg: "]", text: 'unexpected "]"' },
  { query: "$['a", code: "JP005", col: 3, arg: "", text: "unterminated string" },
  { query: "$[01]", code: "JP006", col: 3, arg: "", text: "bad number" },
  { query: "$[-0]", code: "JP006", col: 3, arg: "", text: "bad number" },
  { query: "$[9007199254740992]", code: "JP007", col: 3, arg: "", text: "number out of range" },
  { query: "$[1:2:3:4]", code: "JP002", col: 8, arg: ":", text: 'unexpected ":"' },
  { query: "$[1:x]", code: "JP002", col: 5, arg: "x", text: 'unexpected "x"' },
  { query: "$.[0]", code: "JP002", col: 3, arg: "[", text: 'unexpected "["' },
])("reports exact structural fault for $query", ({ query, code, col, arg, text }) => {
  const fault = faultFromMemory(query);
  expect({ code: fault.code, col: fault.col, arg: fault.arg, text: fault.text }).toEqual({
    code,
    col,
    arg,
    text,
  });
});

const supportedQueries: Array<{ query: string; segments: Query["segments"] }> = [
  {
    query: "$.a\r.b",
    segments: [
      { col: 2, mode: "child", selectors: [{ col: 3, kind: "name", name: "a" }] },
      { col: 5, mode: "child", selectors: [{ col: 6, kind: "name", name: "b" }] },
    ],
  },
  {
    query: "$.é",
    segments: [{ col: 2, mode: "child", selectors: [{ col: 3, kind: "name", name: "é" }] }],
  },
  {
    query: "$.😀ok",
    segments: [{ col: 2, mode: "child", selectors: [{ col: 3, kind: "name", name: "😀ok" }] }],
  },
  {
    query: "$..[0,*]",
    segments: [
      {
        col: 2,
        mode: "descendant",
        selectors: [
          { col: 5, kind: "index", index: 0 },
          { col: 7, kind: "wild" },
        ],
      },
    ],
  },
  {
    query: "$[ 1 : 3 : 2 , -1 ]",
    segments: [
      {
        col: 2,
        mode: "child",
        selectors: [
          { col: 4, kind: "slice", start: 1, end: 3, step: 2 },
          { col: 16, kind: "index", index: -1 },
        ],
      },
    ],
  },
];

test.each(supportedQueries)(
  "parses supported structure and retains selector values: $query",
  ({ query, segments }) => {
    expect(parseFromMemory(query).segments).toEqual(segments);
  },
);

test.each([
  {
    text: "1 : 3 : 2,",
    depth: 0,
    expected: { selector: { col: 1, kind: "slice", start: 1, end: 3, step: 2 }, next: 9 },
  },
  {
    text: "2 ",
    depth: 0,
    expected: { selector: { col: 1, kind: "index", index: 2 }, next: 1 },
  },
])("parseSelector returns the selector boundary for $text", ({ text, depth, expected }) => {
  expect(selectorFromMemory(text, depth)).toEqual(expected);
});

test.each([
  { arg: "$[", message: "query:3: JP003 unexpected end" },
  { arg: "$[?foo(1)==1]", message: 'query:4: JP011 unknown function "foo"' },
  { arg: "$['😀']!", message: 'query:7: JP002 unexpected "!"' },
])("translates readQuery faults without a CLI prefix for $arg", ({ arg, message }) => {
  expect(failureFromMemory(arg).message).toBe(message);
});

test("readQuery rejects a raw unpaired surrogate directly from memory", () => {
  const arg = `a${String.fromCharCode(0xd800)}`;
  expect(failureFromMemory(arg).message).toBe('invalid text "a?"');
});

test("readQuery accepts a valid astral shorthand name from memory", () => {
  expect(argumentFromMemory("$.😀ok")).toEqual(parseFromMemory("$.😀ok"));
});
