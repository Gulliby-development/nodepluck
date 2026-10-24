import { expect, test } from "bun:test";
import { Inputs, MemIo } from "../src/io";
import { splitLines } from "../src/lines";
import { parseQuery } from "../src/parse";
import { type Problem, render, sortedProblems } from "../src/problem";
import { findProblems } from "../src/rules";

function readFixture(text: string): string {
  const io = new MemIo(new TextEncoder().encode(text));
  return new Inputs(io).read("-").text;
}

test.each<{ input: string; expected: string[] }>([
  { input: "", expected: [""] },
  { input: "$.a\n", expected: ["$.a", ""] },
  { input: "\n$.a\n\n", expected: ["", "$.a", "", ""] },
  { input: "$.a\r\n$.b\r\n", expected: ["$.a", "$.b", ""] },
  { input: "$.a\r", expected: ["$.a\r"] },
  { input: "$.a\r.b", expected: ["$.a\r.b"] },
  { input: "x\r\r\n", expected: ["x\r", ""] },
  {
    input: "\uFEFF$.a\u2028b\u0085\u2029\u3000",
    expected: ["\uFEFF$.a\u2028b\u0085\u2029\u3000"],
  },
])("splitLines preserves physical line boundaries for $input", ({ input, expected }) => {
  const actual = splitLines(readFixture(input));

  expect(actual).toEqual(expected);
});

test("sortedProblems returns a fresh, stable column-and-code ordering", () => {
  const found: Problem[] = [
    { col: 3, code: "JP104", text: "a" },
    { col: 2, code: "JP103", text: "b" },
    { col: 3, code: "JP101", text: "c" },
    { col: 3, code: "JP101", text: "d" },
  ];
  const io = new MemIo();
  const sorted = sortedProblems(found);
  io.out(sorted.map((problem) => problem.text).join("|"));

  expect(sorted).not.toBe(found);
  expect(sorted).toEqual([
    { col: 2, code: "JP103", text: "b" },
    { col: 3, code: "JP101", text: "c" },
    { col: 3, code: "JP101", text: "d" },
    { col: 3, code: "JP104", text: "a" },
  ]);
  expect(found).toEqual([
    { col: 3, code: "JP104", text: "a" },
    { col: 2, code: "JP103", text: "b" },
    { col: 3, code: "JP101", text: "c" },
    { col: 3, code: "JP101", text: "d" },
  ]);
  expect(io.stdout).toBe("b|c|d|a");
});

test("render produces the exact display, line, column and diagnostic text", () => {
  const io = new MemIo();
  const problem = { col: 3, code: "JP104", text: "slice selects nothing" };
  io.out(render("t.txt", 2, problem));

  expect(io.stdout).toBe("t.txt:2:3: JP104 slice selects nothing");
});

test.each<{ query: string; expected: Problem[] }>([
  {
    query: "$['a','b','a']",
    expected: [{ col: 11, code: "JP101", text: "repeated selector" }],
  },
  {
    query: "$['a','\\u0061','a']",
    expected: [
      { col: 7, code: "JP101", text: "repeated selector" },
      { col: 16, code: "JP101", text: "repeated selector" },
    ],
  },
  {
    query: "$[1,1,1]",
    expected: [
      { col: 5, code: "JP101", text: "repeated selector" },
      { col: 7, code: "JP101", text: "repeated selector" },
    ],
  },
  {
    query: "$[*,*]",
    expected: [{ col: 5, code: "JP101", text: "repeated selector" }],
  },
  { query: "$['a']['a']", expected: [] },
  { query: "$[1:3,1:3]", expected: [] },
  {
    query: "$[::0]",
    expected: [{ col: 3, code: "JP102", text: "step 0 selects nothing" }],
  },
  {
    query: "$[3:3:0]",
    expected: [{ col: 3, code: "JP102", text: "step 0 selects nothing" }],
  },
  {
    query: "$[?1==1]",
    expected: [{ col: 4, code: "JP103", text: "comparison of two literals" }],
  },
  {
    query: "$['😀',1,1]",
    expected: [{ col: 9, code: "JP101", text: "repeated selector" }],
  },
])("findProblems detects duplicate and zero-step cases in $query", ({ query, expected }) => {
  const io = new MemIo(new TextEncoder().encode(query));
  const source = new Inputs(io).read("-");
  const actual = findProblems(parseQuery(source.text));

  expect(actual).toEqual(expected);
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
});

test.each<{ query: string; expected: Problem[] }>([
  {
    query: "$[0:0]",
    expected: [{ col: 3, code: "JP104", text: "slice selects nothing" }],
  },
  {
    query: "$[3:1]",
    expected: [{ col: 3, code: "JP104", text: "slice selects nothing" }],
  },
  {
    query: "$[3:1:2]",
    expected: [{ col: 3, code: "JP104", text: "slice selects nothing" }],
  },
  {
    query: "$[1:1:-1]",
    expected: [{ col: 3, code: "JP104", text: "slice selects nothing" }],
  },
  {
    query: "$[1:2:-1]",
    expected: [{ col: 3, code: "JP104", text: "slice selects nothing" }],
  },
  { query: "$[0:1]", expected: [] },
  { query: "$[2:1:-1]", expected: [] },
  { query: "$[-1:-1]", expected: [] },
  { query: "$[:0]", expected: [] },
  { query: "$[0:]", expected: [] },
  { query: "$[1:-1]", expected: [] },
])("findProblems classifies empty slice ranges in $query", ({ query, expected }) => {
  const actual = findProblems(parseQuery(readFixture(query)));

  expect(actual).toEqual(expected);
});

test.each<{ query: string; expected: Problem[] }>([
  {
    query: "$[?count(@[0,0])==1]",
    expected: [{ col: 14, code: "JP101", text: "repeated selector" }],
  },
  {
    query: "$[?@.b[?-1<0]]",
    expected: [{ col: 9, code: "JP103", text: "comparison of two literals" }],
  },
  {
    query: "$[?!(1==1)]",
    expected: [{ col: 6, code: "JP103", text: "comparison of two literals" }],
  },
  {
    query: "$[?1==1 && 2==2 || 3==3]",
    expected: [
      { col: 4, code: "JP103", text: "comparison of two literals" },
      { col: 12, code: "JP103", text: "comparison of two literals" },
      { col: 20, code: "JP103", text: "comparison of two literals" },
    ],
  },
  {
    query: "$[?count(@.x[0,0])==1 && count(@.y[*,*])==2 || count(@.z[1,1])==3]",
    expected: [
      { col: 16, code: "JP101", text: "repeated selector" },
      { col: 38, code: "JP101", text: "repeated selector" },
      { col: 60, code: "JP101", text: "repeated selector" },
    ],
  },
])("findProblems recursively inspects nested expressions in $query", ({ query, expected }) => {
  const actual = findProblems(parseQuery(readFixture(query)));

  expect(actual).toEqual(expected);
});
