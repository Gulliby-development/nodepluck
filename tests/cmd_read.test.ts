import { expect, test } from "bun:test";
import { USAGE as explainUsage, runExplain } from "../src/cmd_explain";
import { USAGE as quoteUsage, runQuote } from "../src/cmd_quote";
import { runSlice, USAGE as sliceUsage } from "../src/cmd_slice";
import { runUnquote, USAGE as unquoteUsage } from "../src/cmd_unquote";
import { Failure } from "../src/fault";
import type { Io } from "../src/io";
import { MemIo } from "../src/io";

type Runner = (args: string[], io: Io) => number;

function expectFailure(run: Runner, args: string[], message: string): void {
  const io = new MemIo();
  let thrown: unknown;
  try {
    run(args, io);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Failure);
  expect((thrown as Failure).message).toBe(message);
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
}

function expectRun(run: Runner, args: string[], code: number, stdout: string): void {
  const io = new MemIo();
  expect(run(args, io)).toBe(code);
  expect(io.stdout).toBe(stdout);
  expect(io.stderr).toBe("");
}

test("read commands export their exact usage words", () => {
  expect(explainUsage).toBe("nodepluck explain QUERY");
  expect(sliceUsage).toBe("nodepluck slice SPEC LENGTH");
  expect(quoteUsage).toBe("nodepluck quote [--double] TEXT");
  expect(unquoteUsage).toBe("nodepluck unquote LITERAL");
});

test("quote treats a dashed argument as text", () => {
  expectRun(runQuote, ["-x"], 0, "'-x'");
});

test.each<{
  label: string;
  run: Runner;
  args: string[];
  failure: string;
}>([
  {
    label: "explain rejects a missing operand",
    run: runExplain,
    args: [],
    failure: "usage: nodepluck explain QUERY",
  },
  {
    label: "slice rejects a missing length",
    run: runSlice,
    args: ["1:2"],
    failure: "usage: nodepluck slice SPEC LENGTH",
  },
  {
    label: "quote rejects missing text",
    run: runQuote,
    args: [],
    failure: "usage: nodepluck quote [--double] TEXT",
  },
  {
    label: "unquote rejects a missing literal",
    run: runUnquote,
    args: [],
    failure: "usage: nodepluck unquote LITERAL",
  },
  {
    label: "quote rejects an extra operand",
    run: runQuote,
    args: ["a", "b"],
    failure: "usage: nodepluck quote [--double] TEXT",
  },
  {
    label: "explain rejects an extra operand",
    run: runExplain,
    args: ["$", "$"],
    failure: "usage: nodepluck explain QUERY",
  },
  {
    label: "slice rejects an extra operand",
    run: runSlice,
    args: [":", "1", "2"],
    failure: "usage: nodepluck slice SPEC LENGTH",
  },
  {
    label: "unquote rejects an extra operand",
    run: runUnquote,
    args: ["''", "''"],
    failure: "usage: nodepluck unquote LITERAL",
  },
  {
    label: "quote checks options before arity",
    run: runQuote,
    args: ["--help"],
    failure: 'unknown option "--help"',
  },
  {
    label: "slice rejects the first unknown option",
    run: runSlice,
    args: ["--", "--oops"],
    failure: 'unknown option "--"',
  },
  {
    label: "explain rejects options with attached values",
    run: runExplain,
    args: ["--paths=1"],
    failure: 'unknown option "--paths=1"',
  },
])("$label", ({ run, args, failure }) => {
  expectFailure(run, args, failure);
});

test.each<{ args: string[]; code: number; stdout: string }>([
  { args: ["$"], code: 1, stdout: "" },
  {
    args: ["$.store..book[0,2:4]..*[?@.p<10 && !(@.q)]['x']"],
    code: 0,
    stdout:
      "N  SEG  COL  MODE        SELECTOR  DETAIL\n" +
      '1  1    3    child       name      "store"\n' +
      '2  2    10   descendant  name      "book"\n' +
      "3  3    15   child       index     0\n" +
      "4  3    17   child       slice     2:4:1\n" +
      "5  4    23   descendant  wildcard  -\n" +
      '6  5    25   child       filter    "@.p<10 && !(@.q)"\n' +
      '7  6    44   child       name      "x"\n',
  },
  {
    args: ["$.😀['\\u0061',::-1]"],
    code: 0,
    stdout:
      "N  SEG  COL  MODE   SELECTOR  DETAIL\n" +
      '1  1    3    child  name      "?"\n' +
      '2  2    5    child  name      "a"\n' +
      "3  2    14   child  slice     -:-:-1\n",
  },
])("explain returns the prescribed listing for $args", ({ args, code, stdout }) => {
  expectRun(runExplain, args, code, stdout);
});

test.each<{ query: string; failure: string }>([
  { query: "", failure: 'query:1: JP001 query must start with "$"' },
  { query: " ", failure: 'query:1: JP001 query must start with "$"' },
  { query: "$.a ", failure: "query:5: JP003 unexpected end" },
  { query: "$...a", failure: 'query:4: JP002 unexpected "."' },
  { query: "$['a", failure: "query:3: JP005 unterminated string" },
  { query: "$[01]", failure: "query:3: JP006 bad number" },
  { query: "$[-0]", failure: "query:3: JP006 bad number" },
  { query: "$[9007199254740992]", failure: "query:3: JP007 number out of range" },
  { query: "$[?@.*==1]", failure: "query:4: JP010 not a singular query" },
  { query: "$[?@.*==1&&]", failure: 'query:12: JP002 unexpected "]"' },
  { query: "$[?match(@.a,'x')]", failure: 'query:4: JP011 unknown function "match"' },
  { query: "$[?count(1)==1]", failure: 'query:4: JP012 bad arguments for "count"' },
  { query: "$[?1]", failure: "query:4: JP013 not a condition" },
  { query: "a\ud800", failure: 'invalid text "a?"' },
])("explain reports the exact fault for $query", ({ query, failure }) => {
  expectFailure(runExplain, [query], failure);
});

test.each<{ spec: string; length: string; code: number; stdout: string }>([
  { spec: "1:4", length: "3", code: 0, stdout: "1\n2\n" },
  { spec: "1:4", length: "0", code: 1, stdout: "" },
  { spec: ":", length: "3", code: 0, stdout: "0\n1\n2\n" },
  { spec: "::2", length: "5", code: 0, stdout: "0\n2\n4\n" },
  { spec: "::-1", length: "4", code: 0, stdout: "3\n2\n1\n0\n" },
  { spec: "4:1:-1", length: "6", code: 0, stdout: "4\n3\n2\n" },
  { spec: "-2:", length: "5", code: 0, stdout: "3\n4\n" },
  { spec: "-9:9", length: "4", code: 0, stdout: "0\n1\n2\n3\n" },
  { spec: "2:2", length: "5", code: 1, stdout: "" },
  { spec: "1:3:0", length: "5", code: 1, stdout: "" },
  { spec: "-1:-4:-1", length: "5", code: 0, stdout: "4\n3\n2\n" },
  { spec: "1 : 3 : 2", length: "6", code: 0, stdout: "1\n" },
  { spec: "-100:100:-1", length: "3", code: 1, stdout: "" },
  { spec: "0:1", length: "00003", code: 0, stdout: "0\n" },
  { spec: "9999:", length: "10000", code: 0, stdout: "9999\n" },
  { spec: ":-1:-1", length: "4", code: 1, stdout: "" },
  { spec: "1:2", length: "5", code: 0, stdout: "1\n" },
])(
  "slice $spec over length $length returns the prescribed indexes",
  ({ spec, length, code, stdout }) => {
    expectRun(runSlice, [spec, length], code, stdout);
  },
);

test.each<{ args: string[]; failure: string }>([
  { args: ["1:3", "x"], failure: 'bad length "x"' },
  { args: ["1:3", "10001"], failure: 'bad length "10001"' },
  { args: ["1:3", "000000"], failure: 'bad length "000000"' },
  { args: ["1:3", ""], failure: 'bad length ""' },
  { args: ["1:3", "+1"], failure: 'bad length "+1"' },
  { args: ["1:3", " 1"], failure: 'bad length " 1"' },
  { args: ["1:3", "1.0"], failure: 'bad length "1.0"' },
  { args: ["1:3", "1e1"], failure: 'bad length "1e1"' },
  { args: ["1:3", "١"], failure: 'bad length "?"' },
  { args: ["2", "5"], failure: 'not a slice "2"' },
  { args: ["01:2", "5"], failure: "slice:1: JP006 bad number" },
  { args: ["1:2:3:4", "5"], failure: 'slice:6: JP002 unexpected ":"' },
  { args: ["", "5"], failure: "slice:1: JP003 unexpected end" },
  { args: ["01:2", "x"], failure: 'bad length "x"' },
  { args: ["a\ud800", "x"], failure: 'invalid text "a?"' },
  { args: ["2", "a\ud800"], failure: 'invalid text "a?"' },
  { args: ["2x", "5"], failure: 'slice:2: JP002 unexpected "x"' },
])("slice reports the exact validation failure for $args", ({ args, failure }) => {
  expectFailure(runSlice, args, failure);
});

test.each<{ text: string; expected: string }>([
  { text: "", expected: "''" },
  { text: "abc", expected: "'abc'" },
  { text: "it's", expected: "'it\\'s'" },
  { text: "\\", expected: "'\\\\'" },
  { text: "tab\tx", expected: "'tab\\tx'" },
  { text: "line\nx", expected: "'line\\nx'" },
  { text: "cr\rx", expected: "'cr\\rx'" },
  { text: "\b\f\u0000\u001f", expected: "'\\b\\f\\u0000\\u001f'" },
  { text: "é😀", expected: "'é😀'" },
  {
    text: "\u007f\u00a0\u0085\u2028\u2029\u3000\u200b\ufeff",
    expected: "'\u007f\u00a0\u0085\u2028\u2029\u3000\u200b\ufeff'",
  },
  { text: "$['a']", expected: "'$[\\'a\\']'" },
])("quote writes the exact literal for $text", ({ text, expected }) => {
  expectRun(runQuote, [text], 0, expected);
});

test("quote rejects an unpaired surrogate", () => {
  expectFailure(runQuote, ["a\ud800"], 'invalid text "a?"');
});

test.each<{ literal: string; expected: string }>([
  { literal: "''", expected: "" },
  { literal: '""', expected: "" },
  { literal: "'abc'", expected: "abc" },
  { literal: "'it\\'s'", expected: "it's" },
  { literal: '"it\\"s"', expected: 'it"s' },
  { literal: "'a\\/b'", expected: "a/b" },
  { literal: "'\\\\'", expected: "\\" },
  { literal: "'\\b\\f\\n\\r\\t'", expected: "\b\f\n\r\t" },
  { literal: "'\\u0041\\u00e9\\u00E9'", expected: "Aéé" },
  { literal: "'\\ud83d\\ude00'", expected: "😀" },
  { literal: "'😀é'", expected: "😀é" },
  { literal: "' ​﻿'", expected: " ​﻿" },
  { literal: "'  　'", expected: "  　" },
])("unquote decodes the complete literal $literal", ({ literal, expected }) => {
  expectRun(runUnquote, [literal], 0, expected);
});

test("unquote decodes an escaped surrogate pair", () => {
  expectRun(runUnquote, ["'\\ud83d\\ude00'"], 0, "😀");
});

test.each<{ literal: string; failure: string }>([
  { literal: "'\\\"'", failure: "literal:2: JP004 bad escape" },
  { literal: "'\\x41'", failure: "literal:2: JP004 bad escape" },
  { literal: "'\\u12'", failure: "literal:2: JP004 bad escape" },
  { literal: "'\\u12G4'", failure: "literal:2: JP004 bad escape" },
  { literal: "'\\ud83d'", failure: "literal:2: JP004 bad escape" },
  { literal: "'\\ude00'", failure: "literal:2: JP004 bad escape" },
  { literal: "'abc", failure: "literal:1: JP005 unterminated string" },
  { literal: "'a\tb'", failure: 'literal:3: JP002 unexpected "?"' },
  { literal: "'a\rb'", failure: 'literal:3: JP002 unexpected "?"' },
  { literal: "'a'b", failure: 'literal:4: JP002 unexpected "b"' },
  { literal: "abc", failure: 'literal:1: JP002 unexpected "a"' },
  { literal: "", failure: "literal:1: JP003 unexpected end" },
  { literal: "'😀'x", failure: 'literal:4: JP002 unexpected "x"' },
  { literal: "a\ud800", failure: 'invalid text "a?"' },
])("unquote rejects malformed literal $literal", ({ literal, failure }) => {
  expectFailure(runUnquote, [literal], failure);
});

class Fake extends MemIo {
  outCalls = 0;
  errCalls = 0;
  readFileCalls = 0;
  readStdinCalls = 0;

  override out(text: string): void {
    this.outCalls += 1;
    super.out(text);
  }

  override err(text: string): void {
    this.errCalls += 1;
    super.err(text);
  }

  override readFile(path: string): Uint8Array {
    this.readFileCalls += 1;
    return super.readFile(path);
  }

  override readStdin(): Uint8Array {
    this.readStdinCalls += 1;
    return super.readStdin();
  }
}

function expectIoCalls(io: Fake, outCalls: number, stdout: string): void {
  expect(io.outCalls).toBe(outCalls);
  expect(io.errCalls).toBe(0);
  expect(io.readFileCalls).toBe(0);
  expect(io.readStdinCalls).toBe(0);
  expect(io.stdout).toBe(stdout);
  expect(io.stderr).toBe("");
}

test("read adapters buffer output and do not read or write errors", () => {
  const explainIo = new Fake();
  expect(runExplain(["$.store..book[0,2:4]..*[?@.p<10 && !(@.q)]['x']"], explainIo)).toBe(0);
  expectIoCalls(
    explainIo,
    1,
    "N  SEG  COL  MODE        SELECTOR  DETAIL\n" +
      '1  1    3    child       name      "store"\n' +
      '2  2    10   descendant  name      "book"\n' +
      "3  3    15   child       index     0\n" +
      "4  3    17   child       slice     2:4:1\n" +
      "5  4    23   descendant  wildcard  -\n" +
      '6  5    25   child       filter    "@.p<10 && !(@.q)"\n' +
      '7  6    44   child       name      "x"\n',
  );

  const emptyExplainIo = new Fake();
  expect(runExplain(["$"], emptyExplainIo)).toBe(1);
  expectIoCalls(emptyExplainIo, 0, "");

  const sliceIo = new Fake();
  expect(runSlice([":", "3"], sliceIo)).toBe(0);
  expectIoCalls(sliceIo, 1, "0\n1\n2\n");

  const emptySliceIo = new Fake();
  expect(runSlice(["::0", "3"], emptySliceIo)).toBe(1);
  expectIoCalls(emptySliceIo, 0, "");

  const quoteIo = new Fake();
  expect(runQuote([""], quoteIo)).toBe(0);
  expectIoCalls(quoteIo, 1, "''");

  const unquoteIo = new Fake();
  expect(runUnquote(["''"], unquoteIo)).toBe(0);
  expectIoCalls(unquoteIo, 1, "");

  const failureIo = new Fake();
  expect(() => runUnquote(["'\\x'"], failureIo)).toThrow(
    new Failure("literal:2: JP004 bad escape"),
  );
  expectIoCalls(failureIo, 0, "");
});
