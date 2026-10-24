import { expect, test } from "bun:test";
import { runSelect, USAGE } from "../src/cmd_select";
import { Failure } from "../src/fault";
import { MemIo } from "../src/io";

class Fake extends MemIo {
  reads = 0;
  outCalls = 0;

  override readStdin(): Uint8Array {
    this.reads += 1;
    return super.readStdin();
  }

  override readFile(path: string): Uint8Array {
    this.reads += 1;
    return super.readFile(path);
  }

  override out(text: string): void {
    this.outCalls += 1;
    super.out(text);
  }
}

type SuccessCase = {
  args: string[];
  stdin: Uint8Array<ArrayBuffer>;
  files: Record<string, Uint8Array>;
  output: string;
};

type FailureCase = {
  args: string[];
  files: Record<string, Uint8Array>;
  message: string;
  reads: number;
};

test("exports the exact select usage", () => {
  expect(USAGE).toBe("nodepluck select [--paths] QUERY DOC");
});

const successCases: SuccessCase[] = [
  {
    args: ["$", "doc.json"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode("42") },
    output: "42\n",
  },
  {
    args: ["$", "doc.json"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode('{ "10": 1, "2": 2 }') },
    output: '{"10":1,"2":2}\n',
  },
  {
    args: ["$['2','10','2']", "doc.json"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode('{"10":"ten","2":"two"}') },
    output: '"two"\n"ten"\n"two"\n',
  },
  {
    args: ["--paths", "$", "doc.json"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode("null") },
    output: "$\tnull\n",
  },
  {
    args: ["--paths", "$.a[1]", "doc.json"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode('{"a":[0,{"x":2}]}') },
    output: "$['a'][1]\t{\"x\":2}\n",
  },
  {
    args: ["--paths", "$['é\\'😀']", "doc.json"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode('{"é\'😀":1}') },
    output: "$['é\\'😀']\t1\n",
  },
  {
    args: ["$.a", "-"],
    stdin: new TextEncoder().encode('{"a":true}'),
    files: {},
    output: "true\n",
  },
  {
    args: ["$.a", "doc.json", "--paths", "--paths"],
    stdin: new Uint8Array(),
    files: { "doc.json": new TextEncoder().encode('{"a":1}') },
    output: "$['a']\t1\n",
  },
];

test.each(successCases)("selects and renders $args", ({ args, stdin, files, output }) => {
  const io = new Fake(stdin, files);

  expect(runSelect(args, io)).toBe(0);
  expect(io.stdout).toBe(output);
  expect(io.stderr).toBe("");
  expect(io.reads).toBe(1);
  expect(io.outCalls).toBe(1);
});

test("returns one for an empty selection without calling out", () => {
  const io = new Fake(new Uint8Array(), {
    "doc.json": new TextEncoder().encode('{"a":1}'),
  });

  expect(runSelect(["$.missing", "doc.json"], io)).toBe(1);
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
  expect(io.reads).toBe(1);
  expect(io.outCalls).toBe(0);
});

const failureCases: FailureCase[] = [
  {
    args: ["--oops", "$", "doc.json"],
    files: { "doc.json": new TextEncoder().encode("{}") },
    message: 'unknown option "--oops"',
    reads: 0,
  },
  {
    args: ["--", "$", "doc.json"],
    files: { "doc.json": new TextEncoder().encode("{}") },
    message: 'unknown option "--"',
    reads: 0,
  },
  {
    args: ["--help"],
    files: {},
    message: 'unknown option "--help"',
    reads: 0,
  },
  {
    args: ["--paths=1", "$", "doc.json"],
    files: { "doc.json": new TextEncoder().encode("{}") },
    message: 'unknown option "--paths=1"',
    reads: 0,
  },
  {
    args: ["$"],
    files: {},
    message: "usage: nodepluck select [--paths] QUERY DOC",
    reads: 0,
  },
  {
    args: ["$", "doc.json", "extra.json"],
    files: { "doc.json": new TextEncoder().encode("{}") },
    message: "usage: nodepluck select [--paths] QUERY DOC",
    reads: 0,
  },
  {
    args: ["$\uD800", "missing.json"],
    files: {},
    message: 'invalid text "$?"',
    reads: 0,
  },
  {
    args: ["$[", "missing.json"],
    files: {},
    message: "query:3: JP003 unexpected end",
    reads: 0,
  },
  {
    args: ["$[", "bad.json"],
    files: { "bad.json": new TextEncoder().encode('{"a": }') },
    message: "query:3: JP003 unexpected end",
    reads: 0,
  },
  {
    args: ["$.a", "missing.json"],
    files: {},
    message: "missing.json: cannot read the file",
    reads: 1,
  },
  {
    args: ["$.a", "bad.json"],
    files: { "bad.json": new TextEncoder().encode('{"a": }') },
    message: "bad.json: not valid JSON",
    reads: 1,
  },
  {
    args: ["$.a", "bad.json"],
    files: { "bad.json": new Uint8Array([0x7b, 0xff, 0x7d]) },
    message: "bad.json: input is not valid UTF-8",
    reads: 1,
  },
  {
    args: ["$..[0,0,0,0]..[0,0,0,0]..[0,0,0,0]", "doc.json"],
    files: {
      "doc.json": new TextEncoder().encode("[[[[[[[[[[[[0]]]]]]]]]]]]"),
    },
    message: "too many nodes",
    reads: 1,
  },
];

test.each(failureCases)(
  "rejects $args before writing output",
  ({ args, files, message, reads }) => {
    const io = new Fake(new Uint8Array(), files);
    let thrown: unknown;

    try {
      runSelect(args, io);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Failure);
    expect(thrown instanceof Failure ? thrown.message : "").toBe(message);
    expect(io.stdout).toBe("");
    expect(io.stderr).toBe("");
    expect(io.reads).toBe(reads);
    expect(io.outCalls).toBe(0);
  },
);
