import { expect, test } from "bun:test";
import type { Query } from "../src/ast";
import { Fault } from "../src/fault";
import { checkTypes, FUNCTIONS, isSingular } from "../src/funcs";
import { Inputs, MemIo } from "../src/io";
import { parseQuery, parseSelector } from "../src/parse";
import { codePoints } from "../src/text";

function inputText(text: string): string {
  const io = new MemIo(new Uint8Array(), {
    query: new TextEncoder().encode(text),
  });
  return new Inputs(io).read("query").text;
}

function characters(text: string): string[] {
  return codePoints(inputText(text));
}

function parsed(text: string): Query {
  return parseQuery(inputText(text));
}

function expectFault(
  run: () => unknown,
  code: string,
  col: number,
  arg: string,
  message: string,
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
    expect(caught.text).toBe(message);
  }
}

const depth32 =
  "$[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?(@.a)])])])])])])])])])])])])])])]";
const depth33 =
  "$[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?($[?(@.a)])])])])])])])])])])])])])])])])]";

test("filter source omits boundary blanks and retains interior text and columns", () => {
  const selector = parsed("$[?  @.a < 10 && !(@.b)  ]").segments[0]?.selectors[0];
  expect(selector).toMatchObject({
    col: 3,
    kind: "filter",
    source: "@.a < 10 && !(@.b)",
    expr: {
      kind: "and",
      left: { kind: "cmp", op: "<" },
      right: { kind: "not", expr: { kind: "paren", expr: { kind: "query" } } },
    },
  });
});

test("nested filters retain their own original source text", () => {
  expect(parsed("$[?value(@.tags[?@=='c'])=='c']").segments[0]?.selectors[0]).toMatchObject({
    kind: "filter",
    source: "value(@.tags[?@=='c'])=='c'",
    expr: {
      kind: "cmp",
      left: {
        kind: "call",
        name: "value",
        args: [
          {
            kind: "query",
            query: {
              segments: [
                { selectors: [{ kind: "name", name: "tags" }] },
                { selectors: [{ kind: "filter", source: "@=='c'" }] },
              ],
            },
          },
        ],
      },
      right: { kind: "lit", value: "c" },
    },
  });
});

test.each([
  {
    text: "$[?@.a || @.b && @.c]",
    shape: { kind: "or", left: { kind: "query" }, right: { kind: "and" } },
  },
  {
    text: "$[?@.a || @.b || @.c]",
    shape: { kind: "or", left: { kind: "or" }, right: { kind: "query" } },
  },
])("logical operators use precedence and left association in $text", ({ text, shape }) => {
  expect(parsed(text).segments[0]?.selectors[0]).toMatchObject({ expr: shape });
});

test.each([
  { text: "$[?@.a=1]", code: "JP002", col: 7, arg: "=", message: 'unexpected "="' },
  { text: "$[?@.a==1e999]", code: "JP007", col: 9, arg: "", message: "number out of range" },
  { text: "$[?@.a==True]", code: "JP002", col: 9, arg: "T", message: 'unexpected "T"' },
  { text: "$[?!@.a==1]", code: "JP002", col: 8, arg: "=", message: 'unexpected "="' },
  { text: "$[?@.a==[1]]", code: "JP002", col: 9, arg: "[", message: 'unexpected "["' },
  { text: "$[?length (@.a)==1]", code: "JP002", col: 10, arg: " ", message: 'unexpected " "' },
])(
  "rejects malformed filter syntax at the first character in $text",
  ({ text, code, col, arg, message }) => {
    expectFault(() => parsed(text), code, col, arg, message);
  },
);

test.each([
  { text: "?(@)", depth: 31, outcome: "ok", next: 4 },
  { text: "?(@)", depth: 32, outcome: "deep", col: 2 },
  { text: "?count(@)==1", depth: 32, outcome: "deep", col: 7 },
  { text: "?@[0]", depth: 32, outcome: "deep", col: 3 },
])(
  "parseSelector counts simultaneous openers for $text at depth $depth",
  ({ text, depth, outcome, next, col }) => {
    if (outcome === "ok") {
      expect(parseSelector(characters(text), 0, depth)).toMatchObject({
        selector: { kind: "filter" },
        next,
      });
    } else {
      expectFault(
        () => parseSelector(characters(text), 0, depth),
        "JP009",
        col ?? 0,
        "",
        "nested too deeply",
      );
    }
  },
);

test.each([
  { text: depth32, outcome: "ok" },
  { text: depth33, outcome: "deep", col: 66 },
  { text: `${depth32}.tail`, outcome: "sibling" },
])(
  "full query depth boundaries and closed sibling segments: $outcome",
  ({ text, outcome, col }) => {
    if (outcome === "ok") {
      expect(parsed(text).root).toBe("$");
    } else if (outcome === "sibling") {
      expect(parsed(text).segments.at(-1)?.selectors[0]).toMatchObject({
        kind: "name",
        name: "tail",
      });
    } else {
      expectFault(() => parsed(text), "JP009", col ?? 0, "", "nested too deeply");
    }
  },
);

test.each([
  { text: "$", singular: true },
  { text: "$.a[0]", singular: true },
  { text: "$['x'][-1]", singular: true },
  { text: "$.*", singular: false },
  { text: "$..a", singular: false },
  { text: "$[0,1]", singular: false },
  { text: "$[:]", singular: false },
  { text: "$[?@.a]", singular: false },
])("singularity for $text is $singular", ({ text, singular }) => {
  expect(isSingular(parsed(text))).toBe(singular);
});

test("FUNCTIONS exposes only the specified function metadata", () => {
  expect(FUNCTIONS).toEqual({
    length: { arity: 1, argument: "value", result: "value" },
    count: { arity: 1, argument: "query", result: "value" },
    value: { arity: 1, argument: "query", result: "value" },
  });
  expect(parsed("$[?count(@.a)==1]").segments[0]?.selectors[0]).toMatchObject({ kind: "filter" });
});

test.each([
  { text: "$[?@.*==1]", code: "JP010", col: 4, arg: "", message: "not a singular query" },
  {
    text: "$[?@.a[?@.b==@.*]]",
    code: "JP010",
    col: 14,
    arg: "",
    message: "not a singular query",
  },
  { text: "$[?1]", code: "JP013", col: 4, arg: "", message: "not a condition" },
  { text: "$[?length(@.a)]", code: "JP013", col: 4, arg: "", message: "not a condition" },
  {
    text: "$[?count(1)==1]",
    code: "JP012",
    col: 4,
    arg: "count",
    message: 'bad arguments for "count"',
  },
  {
    text: "$[?length(@.*)==1]",
    code: "JP012",
    col: 4,
    arg: "length",
    message: 'bad arguments for "length"',
  },
  {
    text: "$[?length(@.a==1)==1]",
    code: "JP012",
    col: 4,
    arg: "length",
    message: 'bad arguments for "length"',
  },
  {
    text: "$[?length((@.a))==1]",
    code: "JP012",
    col: 4,
    arg: "length",
    message: 'bad arguments for "length"',
  },
  {
    text: "$[?length()==1]",
    code: "JP012",
    col: 4,
    arg: "length",
    message: 'bad arguments for "length"',
  },
  {
    text: "$[?length(1,2)==1]",
    code: "JP012",
    col: 4,
    arg: "length",
    message: 'bad arguments for "length"',
  },
])("type checking rejects invalid operands in $text", ({ text, code, col, arg, message }) => {
  expectFault(() => parsed(text), code, col, arg, message);
});

test.each([
  { text: "$[?match(@.a,'x')]", name: "match" },
  { text: "$[?search(@.a,'x')]", name: "search" },
  { text: "$[?foo(1)==1]", name: "foo" },
])("unknown function $name is reported at its name", ({ text, name }) => {
  expectFault(() => parsed(text), "JP011", 4, name, `unknown function "${name}"`);
});

test.each([
  "$[?count(@.a)==1]",
  "$[?length(length(@.a))==1]",
  "$[?-1<0]",
  "$[?$.a==@.a]",
  "$[?value(@.*)==null]",
  "$[?!(@.a==1)]",
])("accepts well-typed filter $text", (text) => {
  expect(parsed(text).root).toBe("$");
});

test.each([
  { text: "$[?@.*==1&&]", code: "JP002", col: 12, arg: "]", message: 'unexpected "]"' },
  { text: "$[?1 || foo(1)]", code: "JP013", col: 4, arg: "", message: "not a condition" },
])("syntax and earlier source-order faults win for $text", ({ text, code, col, arg, message }) => {
  expectFault(() => parsed(text), code, col, arg, message);
});

test("checkTypes accepts the structurally parsed selector and reports its exact type fault", () => {
  const scanned = parseSelector(characters("?count(1)==1"), 0, 0);
  if (scanned.selector.kind !== "filter") {
    throw new Error("expected a parsed filter selector");
  }
  const query: Query = {
    col: 1,
    root: "$",
    segments: [{ col: 1, mode: "child", selectors: [scanned.selector] }],
  };
  expectFault(() => checkTypes(query), "JP012", 2, "count", 'bad arguments for "count"');
});

test("checkTypes accepts a well-typed structurally parsed filter", () => {
  const scanned = parseSelector(characters("?count(@.a)==1"), 0, 0);
  if (scanned.selector.kind !== "filter") {
    throw new Error("expected a parsed filter selector");
  }
  const query: Query = {
    col: 1,
    root: "$",
    segments: [{ col: 1, mode: "child", selectors: [scanned.selector] }],
  };
  expect(() => checkTypes(query)).not.toThrow();
});
