import { expect, test } from "bun:test";
import { MemIo } from "../src/io";
import { normalized, type PathComponent, quoteName } from "../src/npath";

const quoteCases: Array<[string, string]> = [
  ["", "''"],
  ["abc", "'abc'"],
  ["it's", "'it\\'s'"],
  ["\\", "'\\\\'"],
  ["\b\f\n\r\t", "'\\b\\f\\n\\r\\t'"],
  ["\u0000\u0001\u000b\u001f", "'\\u0000\\u0001\\u000b\\u001f'"],
  ['"/', "'\"/'"],
  ["é😀", "'é😀'"],
  [
    "\u007f\u00a0\u0085\u2028\u2029\u3000\u200b\ufeff",
    "'\u007f\u00a0\u0085\u2028\u2029\u3000\u200b\ufeff'",
  ],
];

const normalizedCases: Array<[readonly PathComponent[], string]> = [
  [[], "$"],
  [["store", "book", 1, "title"], "$['store']['book'][1]['title']"],
  [["10"], "$['10']"],
  [["2"], "$['2']"],
  [[2], "$[2]"],
  [["k'"], "$['k\\'']"],
  [[""], "$['']"],
  [["a.b"], "$['a.b']"],
  [["\\"], "$['\\\\']"],
  [["é😀"], "$['é😀']"],
  [["\n"], "$['\\n']"],
  [[0, 2], "$[0][2]"],
];

test.each(quoteCases)("quoteName preserves exact literal output for %j", (input, expected) => {
  const io = new MemIo();
  io.out(quoteName(input));
  expect(io.stdout).toBe(expected);
  expect(io.stderr).toBe("");
});

test.each(normalizedCases)("normalized preserves exact path output for %j", (path, expected) => {
  const io = new MemIo();
  io.out(normalized(path));
  expect(io.stdout).toBe(expected);
  expect(io.stderr).toBe("");
});
