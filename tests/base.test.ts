import { expect, test } from "bun:test";
import { Failure, Fault } from "../src/fault";
import { Inputs, MemIo } from "../src/io";
import { need, parse } from "../src/options";
import {
  codePoints,
  hasSurrogate,
  isAlpha,
  isDigit,
  isHex,
  plain,
  plural,
  show,
  table,
} from "../src/text";

class Fake extends MemIo {
  override readStdin(): Uint8Array {
    throw new Error("read failed");
  }
}

test.each([
  { code: "JP001", col: 1, arg: "", expected: 'query must start with "$"' },
  { code: "JP002", col: 3, arg: "😀", expected: 'unexpected "?"' },
  { code: "JP003", col: 4, arg: "", expected: "unexpected end" },
  { code: "JP004", col: 2, arg: "", expected: "bad escape" },
  { code: "JP005", col: 1, arg: "", expected: "unterminated string" },
  { code: "JP006", col: 3, arg: "", expected: "bad number" },
  { code: "JP007", col: 3, arg: "", expected: "number out of range" },
  { code: "JP009", col: 33, arg: "", expected: "nested too deeply" },
  { code: "JP010", col: 4, arg: "", expected: "not a singular query" },
  { code: "JP011", col: 4, arg: "foo", expected: 'unknown function "foo"' },
  { code: "JP012", col: 4, arg: "count", expected: 'bad arguments for "count"' },
  { code: "JP013", col: 4, arg: "", expected: "not a condition" },
])("Fault $code preserves fields and renders its text", ({ code, col, arg, expected }) => {
  const io = new MemIo();
  const fault = new Fault(code, col, arg);
  io.out(fault.text);

  expect(fault).toBeInstanceOf(Error);
  expect(fault.code).toBe(code);
  expect(fault.col).toBe(col);
  expect(fault.arg).toBe(arg);
  expect(new Fault(code, col).arg).toBe("");
  expect(io.stdout).toBe(expected);
});

test("Failure preserves its supplied message", () => {
  const io = new MemIo();
  const failure = new Failure("oops");
  io.out(failure.message);

  expect(failure).toBeInstanceOf(Error);
  expect(io.stdout).toBe("oops");
});

test.each([
  { operation: "plain", input: " A~é😀\n\u007f", expected: " A~????" },
  { operation: "show", input: "a\ud800", expected: '"a?"' },
])("$operation safely displays text", ({ operation, input, expected }) => {
  const io = new MemIo();
  io.out(operation === "plain" ? plain(input) : show(input));

  expect(io.stdout).toBe(expected);
});

test.each<{ input: string; expected: string[] }>([
  { input: "a😀é", expected: ["a", "😀", "é"] },
  { input: "", expected: [] },
])("codePoints splits $input into code points", ({ input, expected }) => {
  const io = new MemIo();
  const points = codePoints(input);
  io.out(points.join("|"));

  expect(points).toEqual(expected);
  expect(io.stdout).toBe(expected.join("|"));
});

test.each([
  { input: "😀", expected: false },
  { input: "a\ud800", expected: true },
  { input: "\udc00", expected: true },
  { input: "\ud800a\udc00", expected: true },
])("hasSurrogate($input) is $expected", ({ input, expected }) => {
  const io = new MemIo();
  const result = hasSurrogate(input);
  io.out(String(result));

  expect(result).toBe(expected);
  expect(io.stdout).toBe(String(expected));
});

test.each([
  { kind: "alpha", input: "A", expected: true },
  { kind: "alpha", input: "z", expected: true },
  { kind: "alpha", input: "é", expected: false },
  { kind: "alpha", input: "", expected: false },
  { kind: "alpha", input: "ab", expected: false },
  { kind: "digit", input: "0", expected: true },
  { kind: "digit", input: "9", expected: true },
  { kind: "digit", input: "９", expected: false },
  { kind: "digit", input: "-", expected: false },
  { kind: "hex", input: "0", expected: true },
  { kind: "hex", input: "F", expected: true },
  { kind: "hex", input: "a", expected: true },
  { kind: "hex", input: "G", expected: false },
  { kind: "hex", input: "ff", expected: false },
])("$kind predicate classifies $input", ({ kind, input, expected }) => {
  const io = new MemIo();
  const result =
    kind === "alpha" ? isAlpha(input) : kind === "digit" ? isDigit(input) : isHex(input);
  io.out(String(result));

  expect(result).toBe(expected);
  expect(io.stdout).toBe(String(expected));
});

test.each([
  { count: 1, word: "query", many: "queries", expected: "1 query" },
  { count: 0, word: "query", many: "queries", expected: "0 queries" },
  { count: 2, word: "problem", many: undefined, expected: "2 problems" },
])("plural formats $count $word", ({ count, word, many, expected }) => {
  const io = new MemIo();
  io.out(many === undefined ? plural(count, word) : plural(count, word, many));

  expect(io.stdout).toBe(expected);
});

test.each<{ header: string[]; rows: string[][]; expected: string[] }>([
  {
    header: ["N", "NAME"],
    rows: [
      ["1", "😀"],
      ["22", "ab"],
    ],
    expected: ["N   NAME", "1   😀", "22  ab"],
  },
  {
    header: ["A", "B"],
    rows: [
      ["😀", "x"],
      ["ab", ""],
    ],
    expected: ["A   B", "😀   x", "ab"],
  },
  { header: ["N"], rows: [], expected: [] },
])("table aligns columns and trims trailing padding", ({ header, rows, expected }) => {
  const io = new MemIo();
  const lines = table(header, rows);
  io.out(lines.join("\n"));

  expect(lines).toEqual(expected);
  expect(lines.every((line) => !line.includes("\n") && !line.endsWith(" "))).toBe(true);
  expect(io.stdout).toBe(expected.join("\n"));
});

test.each<{
  argv: string[];
  specs: string[];
  flags: string[];
  args: string[];
  error: string | undefined;
}>([
  {
    argv: ["--paths", "-", "--paths", "-x", ""],
    specs: ["--paths"],
    flags: ["--paths"],
    args: ["-", "-x", ""],
    error: undefined,
  },
  {
    argv: ["--", "x"],
    specs: ["--paths"],
    flags: [],
    args: [],
    error: 'unknown option "--"',
  },
  {
    argv: ["--help"],
    specs: [],
    flags: [],
    args: [],
    error: 'unknown option "--help"',
  },
  {
    argv: ["--paths=1"],
    specs: ["--paths"],
    flags: [],
    args: [],
    error: 'unknown option "--paths=1"',
  },
  {
    argv: ["--é", "--oops"],
    specs: [],
    flags: [],
    args: [],
    error: 'unknown option "--?"',
  },
])("parse handles exact flags and positional arguments", ({ argv, specs, flags, args, error }) => {
  const io = new MemIo();
  if (error !== undefined) {
    expect(() => parse(argv, specs)).toThrow(new Failure(error));
    io.err(error);
    expect(io.stderr).toBe(error);
  } else {
    const parsed = parse(argv, specs);
    io.out(parsed.args.join("\n"));
    expect([...parsed.flags]).toEqual(flags);
    expect(parsed.args).toEqual(args);
    expect(io.stdout).toBe(args.join("\n"));
  }
});

test.each<{
  words: string;
  args: string[];
  low: number;
  high: number;
  error: string | undefined;
}>([
  {
    words: "nodepluck explain QUERY",
    args: [],
    low: 1,
    high: 1,
    error: "usage: nodepluck explain QUERY",
  },
  { words: "nodepluck explain QUERY", args: ["$"], low: 1, high: 1, error: undefined },
  {
    words: "nodepluck explain QUERY",
    args: ["$", "$"],
    low: 1,
    high: 1,
    error: "usage: nodepluck explain QUERY",
  },
  {
    words: "nodepluck check FILE...",
    args: ["a", "b"],
    low: 1,
    high: -1,
    error: undefined,
  },
  { words: "empty", args: [], low: 0, high: 0, error: undefined },
])("need validates arity for $words", ({ words, args, low, high, error }) => {
  const io = new MemIo();
  if (error !== undefined) {
    expect(() => need(words, args, low, high)).toThrow(new Failure(error));
    io.err(error);
    expect(io.stderr).toBe(error);
  } else {
    need(words, args, low, high);
    io.out("ok");
    expect(io.stdout).toBe("ok");
  }
});

const noFiles: Record<string, Uint8Array> = {};

test.each([
  {
    arg: "-",
    stdin: new Uint8Array([239, 187, 191, 97, 13, 10]),
    files: noFiles,
    expected: { display: "<stdin>", text: "\ufeffa\r\n" },
  },
  {
    arg: "é😀.txt",
    stdin: new Uint8Array(),
    files: { "é😀.txt": new Uint8Array([195, 169, 240, 159, 152, 128]) },
    expected: { display: "??.txt", text: "é😀" },
  },
  {
    arg: "-",
    stdin: new Uint8Array(),
    files: noFiles,
    expected: { display: "<stdin>", text: "" },
  },
])("Inputs reads $arg as unchanged UTF-8 text", ({ arg, stdin, files, expected }) => {
  const io = new MemIo(stdin, files);
  const source = new Inputs(io).read(arg);

  expect(source).toEqual(expected);
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
});

test.each([
  {
    path: `missing${String.fromCodePoint(0x200b)}é.json`,
    expected: "missing??.json: cannot read the file",
    bytes: undefined,
  },
  { path: "toString", expected: "toString: cannot read the file", bytes: undefined },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [123, 255, 125] },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [128] },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [195] },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [195, 40] },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [192, 175] },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [237, 160, 128] },
  { path: "bad.txt", expected: "bad.txt: input is not valid UTF-8", bytes: [244, 144, 128, 128] },
])("Inputs rejects absent files and malformed UTF-8 at $path", ({ path, expected, bytes }) => {
  const files: Record<string, Uint8Array> =
    bytes === undefined ? {} : { [path]: new Uint8Array(bytes) };
  const io = new MemIo(new Uint8Array(), files);
  const inputs = new Inputs(io);

  expect(() => inputs.read(path)).toThrow(new Failure(expected));
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
});

test("stdin is single-use even after a failed read or UTF-8 decode", () => {
  const io = new MemIo();
  const inputs = new Inputs(io);
  inputs.read("-");
  expect(() => inputs.read("-")).toThrow(new Failure("standard input is named twice"));

  const failedInputs = new Inputs(new Fake());
  expect(() => failedInputs.read("-")).toThrow(new Failure("<stdin>: cannot read the file"));
  expect(() => failedInputs.read("-")).toThrow(new Failure("standard input is named twice"));

  const invalidInputs = new Inputs(new MemIo(new Uint8Array([97, 255, 10])));
  expect(() => invalidInputs.read("-")).toThrow(new Failure("<stdin>: input is not valid UTF-8"));
  expect(() => invalidInputs.read("-")).toThrow(new Failure("standard input is named twice"));
});

test("named files may be reread and MemIo output streams append independently", () => {
  const io = new MemIo(new Uint8Array(), { "sample.txt": new Uint8Array([120]) });
  const inputs = new Inputs(io);
  expect(inputs.read("sample.txt")).toEqual({ display: "sample.txt", text: "x" });
  expect(inputs.read("sample.txt")).toEqual({ display: "sample.txt", text: "x" });

  const unicodeFixture = { "é😀.txt": [195, 169, 240, 159, 152, 128] };
  const unicodeIo = new MemIo(new Uint8Array(), {
    "é😀.txt": new Uint8Array(unicodeFixture["é😀.txt"]),
  });
  expect(new Inputs(unicodeIo).read("é😀.txt")).toEqual({
    display: "??.txt",
    text: "é😀",
  });

  io.out("a");
  io.out("b");
  io.err("x");
  io.err("y");

  expect(io.stdout).toBe("ab");
  expect(io.stderr).toBe("xy");
});
