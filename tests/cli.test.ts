import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { run } from "../src/cli";
import { MemIo } from "../src/io";

class Fake extends MemIo {
  outCalls = 0;
  errCalls = 0;

  constructor(
    stdin: Uint8Array<ArrayBuffer> = new Uint8Array(),
    files: Record<string, Uint8Array> = {},
    private readonly outError?: Error,
  ) {
    super(stdin, files);
  }

  override out(text: string): void {
    this.outCalls += 1;
    if (this.outError !== undefined) {
      throw this.outError;
    }
    super.out(text);
  }

  override err(text: string): void {
    this.errCalls += 1;
    super.err(text);
  }
}

test.each<{
  argv: string[];
  status: number;
  stdout: string;
  outCalls: number;
}>([
  {
    argv: ["select", "$.a", "v.json"],
    status: 0,
    stdout: "1\n",
    outCalls: 1,
  },
  {
    argv: ["select", "--paths", "$.a", "v.json"],
    status: 0,
    stdout: "$['a']\t1\n",
    outCalls: 1,
  },
  {
    argv: ["select", "$.absent", "v.json"],
    status: 1,
    stdout: "",
    outCalls: 0,
  },
  {
    argv: ["explain", "$.*"],
    status: 0,
    stdout: "N  SEG  COL  MODE   SELECTOR  DETAIL\n1  1    3    child  wildcard  -\n",
    outCalls: 1,
  },
  { argv: ["explain", "$"], status: 1, stdout: "", outCalls: 0 },
  {
    argv: ["slice", "1:4", "3"],
    status: 0,
    stdout: "1\n2\n",
    outCalls: 1,
  },
  { argv: ["slice", "1:3:0", "5"], status: 1, stdout: "", outCalls: 0 },
  { argv: ["quote", "é😀"], status: 0, stdout: "'é😀'", outCalls: 1 },
  { argv: ["unquote", "'abc'"], status: 0, stdout: "abc", outCalls: 1 },
  { argv: ["unquote", "''"], status: 0, stdout: "", outCalls: 1 },
  {
    argv: ["check", "t.txt"],
    status: 0,
    stdout: "1 query checked, 0 problems\n",
    outCalls: 1,
  },
])("dispatches $argv with literal adapter output", ({ argv, status, stdout, outCalls }) => {
  const io = new Fake(new Uint8Array(), {
    "v.json": new Uint8Array(new TextEncoder().encode('{"a":1}')),
    "t.txt": new Uint8Array(new TextEncoder().encode("$.a")),
  });

  expect(run(argv, io)).toBe(status);
  expect(io.stdout).toBe(stdout);
  expect(io.stderr).toBe("");
  expect(io.outCalls).toBe(outCalls);
  expect(io.outCalls).toBeLessThanOrEqual(1);
  expect(io.errCalls).toBe(0);
});

test("sole --help prints all commands in order with one output write", () => {
  const io = new Fake();

  expect(run(["--help"], io)).toBe(0);
  expect(io.stdout).toBe(
    "usage: nodepluck select [--paths] QUERY DOC\n" +
      "usage: nodepluck explain QUERY\n" +
      "usage: nodepluck slice SPEC LENGTH\n" +
      "usage: nodepluck quote [--double] TEXT\n" +
      "usage: nodepluck unquote LITERAL\n" +
      "usage: nodepluck check FILE...\n",
  );
  expect(io.stderr).toBe("");
  expect(io.outCalls).toBe(1);
  expect(io.errCalls).toBe(0);
});

test.each<{ argv: string[]; stderr: string }>([
  {
    argv: [],
    stderr: "nodepluck: missing command (select, explain, slice, quote, unquote or check)\n",
  },
  { argv: ["frobé\u200b"], stderr: 'nodepluck: unknown command "frob??"\n' },
  { argv: ["--help", "select"], stderr: 'nodepluck: unknown command "--help"\n' },
  { argv: ["select", "--oops", "$"], stderr: 'nodepluck: unknown option "--oops"\n' },
  {
    argv: ["select", "$"],
    stderr: "nodepluck: usage: nodepluck select [--paths] QUERY DOC\n",
  },
  { argv: ["explain", "--help"], stderr: 'nodepluck: unknown option "--help"\n' },
  {
    argv: ["select", "$[", "missing.json"],
    stderr: "nodepluck: query:3: JP003 unexpected end\n",
  },
  { argv: ["slice", "01:2", "x"], stderr: 'nodepluck: bad length "x"\n' },
  { argv: ["quote", "a\ud800"], stderr: 'nodepluck: invalid text "a?"\n' },
])("reports exact CLI diagnostic for $argv", ({ argv, stderr }) => {
  const io = new Fake();

  expect(run(argv, io)).toBe(2);
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe(stderr);
  expect(io.outCalls).toBe(0);
  expect(io.errCalls).toBe(1);
});

test.each<{
  argv: string[];
  stdin: Uint8Array<ArrayBuffer>;
  files: Record<string, Uint8Array<ArrayBuffer>>;
  status: number;
  stdout: string;
  stderr: string;
  outCalls: number;
  errCalls: number;
}>([
  {
    argv: ["check", "t.txt"],
    stdin: new Uint8Array(),
    files: { "t.txt": new Uint8Array(new TextEncoder().encode("$[::0]\n")) },
    status: 1,
    stdout: "t.txt:1:3: JP102 step 0 selects nothing\n1 query checked, 1 problem\n",
    stderr: "",
    outCalls: 1,
    errCalls: 0,
  },
  {
    argv: ["check", "t.txt", "u.txt"],
    stdin: new Uint8Array(),
    files: { "t.txt": new Uint8Array(new TextEncoder().encode("$[::0]\n")) },
    status: 2,
    stdout: "",
    stderr: "nodepluck: u.txt: cannot read the file\n",
    outCalls: 0,
    errCalls: 1,
  },
  {
    argv: ["check", "-", "-"],
    stdin: new Uint8Array(new TextEncoder().encode("$.a\n")),
    files: {},
    status: 2,
    stdout: "",
    stderr: "nodepluck: standard input is named twice\n",
    outCalls: 0,
    errCalls: 1,
  },
])(
  "keeps check output atomic for $argv",
  ({ argv, stdin, files, status, stdout, stderr, outCalls, errCalls }) => {
    const io = new Fake(stdin, files);

    expect(run(argv, io)).toBe(status);
    expect(io.stdout).toBe(stdout);
    expect(io.stderr).toBe(stderr);
    expect(io.outCalls).toBe(outCalls);
    expect(io.outCalls).toBeLessThanOrEqual(1);
    expect(io.errCalls).toBe(errCalls);
  },
);

test("rethrows a non-Failure error from the output stream by identity", () => {
  const streamError = new Error("stream failed");
  const io = new Fake(new Uint8Array(), {}, streamError);
  let thrown: unknown;

  try {
    run(["--help"], io);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(streamError);
  expect(io.stdout).toBe("");
  expect(io.stderr).toBe("");
  expect(io.outCalls).toBe(1);
  expect(io.errCalls).toBe(0);
});

test("main rejects malformed UTF-8 from real standard input", () => {
  const result = Bun.spawnSync([process.execPath, "src/main.ts", "check", "-"], {
    cwd: resolve(import.meta.dir, ".."),
    stdin: new Uint8Array([0x61, 0xff, 0x0a]),
    timeout: 30_000,
  });

  expect(result.exitCode).toBe(2);
  expect(new Uint8Array(result.stdout)).toEqual(new Uint8Array());
  expect(new TextDecoder().decode(new Uint8Array(result.stderr))).toBe(
    "nodepluck: <stdin>: input is not valid UTF-8\n",
  );
});
