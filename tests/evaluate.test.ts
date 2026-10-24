import { expect, test } from "bun:test";
import { select } from "../src/evaluate";
import { Failure } from "../src/fault";
import { Inputs, MemIo } from "../src/io";
import { loadDocument } from "../src/load";
import { parseQuery } from "../src/parse";

function document(text: string) {
  const io = new MemIo(new Uint8Array(), { "doc.json": new TextEncoder().encode(text) });
  const source = new Inputs(io).read("doc.json");
  return loadDocument(source);
}

function selected(query: string, text: string) {
  return select(parseQuery(query), document(text));
}

test.each([
  {
    query: "$[?@>'￠']",
    text: '["z","￠","😀","a😀"]',
    values: ["😀"],
    paths: [[2]],
  },
  {
    query: "$[?@<'😀']",
    text: '["z","￠","😀","a😀"]',
    values: ["z", "￠", "a😀"],
    paths: [[0], [1], [3]],
  },
  {
    query: "$[?length(@)==1]",
    text: '["z","￠","😀","a😀"]',
    values: ["z", "￠", "😀"],
    paths: [[0], [1], [2]],
  },
  {
    query: "$[?length(@)==2]",
    text: '["z","￠","😀","a😀"]',
    values: ["a😀"],
    paths: [[3]],
  },
])("selects strings by code point for $query", ({ query, text, values, paths }) => {
  const nodes = selected(query, text);
  expect(nodes.map((node) => node.value)).toEqual(values.map((value) => value));
  expect(nodes.map((node) => node.path)).toEqual(
    paths.map((path) => path.map((component) => component)),
  );
});

test.each([
  {
    query: "$",
    text: "null",
    values: [null],
    paths: [[]],
  },
  {
    query: "$.*",
    text: '{"b":1,"a":2,"10":3,"2":4}',
    values: [1, 2, 3, 4],
    paths: [["b"], ["a"], ["10"], ["2"]],
  },
  {
    query: "$['2','10','2']",
    text: '{"10":"ten","2":"two"}',
    values: ["two", "ten", "two"],
    paths: [["2"], ["10"], ["2"]],
  },
  {
    query: "$[-1,0,5]",
    text: "[10,20]",
    values: [20, 10],
    paths: [[1], [0]],
  },
  {
    query: "$..['x','x']",
    text: '{"x":1,"a":{"x":2},"b":[{"x":3}]}',
    values: [1, 1, 2, 2, 3, 3],
    paths: [["x"], ["x"], ["a", "x"], ["a", "x"], ["b", 0, "x"], ["b", 0, "x"]],
  },
  {
    query: "$.*",
    text: "3",
    values: [],
    paths: [],
  },
  {
    query: "$.missing",
    text: "{}",
    values: [],
    paths: [],
  },
  {
    query: "$[0]",
    text: '{"0":"a"}',
    values: [],
    paths: [],
  },
])(
  "preserves ordered traversal and paths for $query on $text",
  ({ query, text, values, paths }) => {
    const nodes = selected(query, text);
    expect(nodes.map((node) => node.value)).toEqual(values.map((value) => value));
    expect(nodes.map((node) => node.path)).toEqual(
      paths.map((path) => path.map((component) => component)),
    );
  },
);

test.each([
  {
    query: "$[?@.x]",
    text: '[{"x":null},{"x":false},{"x":0},{"x":""},{}]',
    values: [
      new Map([["x", null]]),
      new Map([["x", false]]),
      new Map([["x", 0]]),
      new Map([["x", ""]]),
    ],
    paths: [[0], [1], [2], [3]],
  },
  {
    query: "$[?@.x==null]",
    text: '[{"x":null},{}]',
    values: [new Map([["x", null]])],
    paths: [[0]],
  },
  {
    query: "$[?@.x==@.y]",
    text: '[{},{"x":1},{"x":2,"y":2}]',
    values: [
      new Map(),
      new Map([
        ["x", 2],
        ["y", 2],
      ]),
    ],
    paths: [[0], [2]],
  },
  {
    query: "$[?!(@.x<2 || @.y) && @.x>=2]",
    text: '[{"x":1},{"x":2},{"x":3,"y":false}]',
    values: [new Map([["x", 2]])],
    paths: [[1]],
  },
  {
    query: "$.items[?@.x==$.target]",
    text: '{"target":2,"items":[{"x":1},{"x":2}]}',
    values: [new Map([["x", 2]])],
    paths: [["items", 1]],
  },
  {
    query: "$[?@>1]",
    text: '{"10":3,"2":2,"a":0}',
    values: [3, 2],
    paths: [["10"], ["2"]],
  },
])("evaluates typed conditions and existence for $query", ({ query, text, values, paths }) => {
  const nodes = selected(query, text);
  expect(nodes.map((node) => node.value)).toEqual(values.map((value) => value));
  expect(nodes.map((node) => node.path)).toEqual(
    paths.map((path) => path.map((component) => component)),
  );
});

test.each([
  {
    query: "$[?length(@)==2]",
    text: '[[1,2],{"a":1,"b":2},true,null,7]',
    values: [
      [1, 2] as number[],
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    ],
    paths: [[0], [1]],
  },
  {
    query: "$[?length(@)==@.missing]",
    text: "[true,null,7,[]]",
    values: [true, null, 7],
    paths: [[0], [1], [2]],
  },
  {
    query: "$[?count(@.a[*])==0]",
    text: '[{"a":[]},{},{"a":[1]}]',
    values: [new Map([["a", []]]), new Map()],
    paths: [[0], [1]],
  },
  {
    query: "$[?count(@.a[0,0])==2]",
    text: '[{"a":[1]},{"a":[]}]',
    values: [new Map([["a", [1]]])],
    paths: [[0]],
  },
  {
    query: "$[?value(@.a[*])==null]",
    text: '[{"a":[null]},{"a":[]},{"a":[null,null]}]',
    values: [new Map([["a", [null]]])],
    paths: [[0]],
  },
  {
    query: "$[?value(@.a[*])==@.missing]",
    text: '[{"a":[]},{"a":[1,2]},{"a":[1]}]',
    values: [new Map([["a", []]]), new Map([["a", [1, 2]]])],
    paths: [[0], [1]],
  },
  {
    query: "$[?length(length(@))==@.missing]",
    text: '["😀",[]]',
    values: ["😀", [] as number[]],
    paths: [[0], [1]],
  },
])("evaluates nested $ function calls for $query", ({ query, text, values, paths }) => {
  const nodes = selected(query, text);
  expect(nodes.map((node) => node.value)).toEqual(values.map((value) => value));
  expect(nodes.map((node) => node.path)).toEqual(
    paths.map((path) => path.map((component) => component)),
  );
});

test("permits exactly 10000 duplicate nodes with the handwritten boundary query", () => {
  const nodes = selected(
    "$[0,0,0,0,0,0,0,0,0,0][0,0,0,0,0,0,0,0,0,0][0,0,0,0,0,0,0,0,0,0][0,0,0,0,0,0,0,0,0,0]",
    "[[[[0]]]]",
  );
  expect(nodes).toHaveLength(10000);
  expect(
    nodes.every(
      (node) =>
        node.value === 0 &&
        node.path.length === 4 &&
        node.path.every((component) => component === 0),
    ),
  ).toBe(true);
});

test.each([
  {
    query:
      "$[0,0,0,0,0,0,0,0,0,0][0,0,0,0,0,0,0,0,0,0][0,0,0,0,0,0,0,0,0,0][0,0,0,0,0,0,0,0,0,0,0]",
    text: "[[[[0]]]]",
  },
  {
    query: "$..[0,0,0,0]..[0,0,0,0]..[0,0,0,0]",
    text: "[[[[[[[[[[[[0]]]]]]]]]]]]",
  },
  {
    query: "$..[0,0,0,0]..[0,0,0,0]..[0,0,0,0].missing",
    text: "[[[[[[[[[[[[0]]]]]]]]]]]]",
  },
  {
    query: "$[?count(@..[0,0,0,0]..[0,0,0,0]..[0,0,0,0])>0]",
    text: "[[[[[[[[[[[[[0]]]]]]]]]]]]]",
  },
])("fails with the exact node limit on $query", ({ query, text }) => {
  let failure: unknown;
  try {
    selected(query, text);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Failure);
  expect(failure instanceof Failure ? failure.message : "").toBe("too many nodes");
});
