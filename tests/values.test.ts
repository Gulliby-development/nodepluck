import { expect, test } from "bun:test";
import {
  type ComparisonOperator,
  compare,
  less,
  lessString,
  NOTHING,
  type Operand,
  same,
} from "../src/compare";
import { type Node, select } from "../src/evaluate";
import { Inputs, MemIo } from "../src/io";
import type { JValue } from "../src/jvalue";
import { loadDocument } from "../src/load";
import { parseQuery } from "../src/parse";
import { sliceIndexes } from "../src/slice";

function document(text: string): JValue {
  const io = new MemIo(new Uint8Array(), { "doc.json": new TextEncoder().encode(text) });
  return loadDocument(new Inputs(io).read("doc.json"));
}

function evaluate(queryText: string, documentText: string): Node[] {
  return select(parseQuery(queryText), document(documentText));
}

function expectBoolean(actual: boolean, expected: boolean): void {
  const io = new MemIo();
  io.out(actual ? "true" : "false");
  expect(io.stdout).toBe(expected ? "true" : "false");
  expect(io.stderr).toBe("");
}

const basicComparisonCases: Array<
  [string, "same" | "less" | "compare", Operand, Operand, ComparisonOperator | null, boolean]
> = [
  ["missing equals missing", "same", NOTHING, NOTHING, null, true],
  ["missing is not null", "same", NOTHING, null, null, false],
  ["non-strict missing equality", "compare", NOTHING, NOTHING, "<=", true],
  ["reversed non-strict missing equality", "compare", NOTHING, NOTHING, ">=", true],
  ["missing has no ordering", "less", NOTHING, 1, null, false],
  ["unlike kinds are unequal", "compare", 1, "1", "!=", true],
  ["booleans have no ordering", "less", false, true, null, false],
  ["signed zero is equal", "same", -0, 0, null, true],
  ["numbers order by value", "compare", 2.5, 2, ">", true],
  ["null has no strict ordering", "less", null, null, null, false],
];

test.each(basicComparisonCases)("%s", (_label, operation, first, second, operator, expected) => {
  if (operation === "same") {
    expectBoolean(same(first, second), expected);
  } else if (operation === "less") {
    expectBoolean(less(first, second), expected);
  } else if (operator !== null) {
    expectBoolean(compare(operator, first, second), expected);
  }
});

test.each([
  {
    label: "array equality preserves order",
    first: "[1,2]",
    second: "[2,1]",
    expected: false,
  },
  {
    label: "object equality ignores member order recursively",
    first: '{"a":[1],"b":null}',
    second: '{"b":null,"a":[1]}',
    expected: true,
  },
])("$label", ({ first, second, expected }) => {
  const io = new MemIo();
  io.out(String(same(document(first), document(second))));
  expect(io.stdout).toBe(String(expected));
  expect(io.stderr).toBe("");
});

test.each([
  ["==", 1, 1, true],
  ["==", 1, "1", false],
  ["!=", 1, 2, true],
  ["!=", NOTHING, NOTHING, false],
  ["<", 1, 2, true],
  ["<", 1, "1", false],
  [">", 2, 1, true],
  [">", 1, 2, false],
  ["<=", 1, 1, true],
  ["<=", 2, 1, false],
  [">=", 1, 1, true],
  [">=", 1, 2, false],
] satisfies Array<[ComparisonOperator, Operand, Operand, boolean]>)(
  "comparison operator %s handles equal, unequal, missing, and unlike operands",
  (operator, first, second, expected) => {
    expectBoolean(compare(operator, first, second), expected);
  },
);

test.each([
  ["￠", "😀", true],
  ["a", "a😀", true],
  ["", "a", true],
  ["😀", "😀", false],
])("lessString(%j, %j) uses code-point ordering", (first, second, expected) => {
  expectBoolean(lessString(first, second), expected);
});

test.each([
  ["$[?@>'￠']", ["😀"], [[2]]],
  ["$[?@<'😀']", ["z", "￠", "a😀"], [[0], [1], [3]]],
  ["$[?length(@)==1]", ["z", "￠", "😀"], [[0], [1], [2]]],
  ["$[?length(@)==2]", ["a😀"], [[3]]],
] as Array<[string, string[], number[][]]>)(
  "select %s with Unicode code-point comparison and length",
  (query, expectedValues, expectedPaths) => {
    const nodes = evaluate(query, '["z","￠","😀","a😀"]');
    expect(nodes.map(({ value }) => value)).toEqual(expectedValues);
    expect(nodes.map(({ path }) => path)).toEqual(expectedPaths);
  },
);

test.each([
  [null, null, -1, 4, "3,2,1,0"],
  [null, -1, -1, 4, ""],
  [-9, 9, null, 4, "0,1,2,3"],
  [null, null, 2, 5, "0,2,4"],
  [-1, -4, -1, 5, "4,3,2"],
  [1, 3, 0, 5, ""],
  [1, 4, null, 0, ""],
  [2, 2, null, 5, ""],
  [-100, 100, -1, 3, ""],
] as Array<[number | null, number | null, number | null, number, string]>)(
  "sliceIndexes(%s, %s, %s, %s) preserves omitted bounds, clipping, and empty boundaries",
  (start, end, step, length, expected) => {
    const io = new MemIo();
    io.out(sliceIndexes(start, end, step, length).join(","));
    expect(io.stdout).toBe(expected);
    expect(io.stderr).toBe("");
  },
);

test.each([
  [
    "$[::-1][?@<3]",
    "[[1,4],[2,5]]",
    [2, 1],
    [
      [1, 0],
      [0, 0],
    ],
  ],
  [
    "$[1:3][?@>=2]",
    "[[0],[1,2],[3]]",
    [2, 3],
    [
      [1, 1],
      [2, 0],
    ],
  ],
] as Array<[string, string, number[], number[][]]>)(
  "slice and comparison integration preserves traversal order and absolute paths for %s",
  (query, json, expectedValues, expectedPaths) => {
    const nodes = evaluate(query, json);
    expect(nodes.map(({ value }) => value)).toEqual(expectedValues);
    expect(nodes.map(({ path }) => path)).toEqual(expectedPaths);
  },
);
