import { expect, test } from "bun:test";
import { runCheck } from "../src/check";
import { Failure } from "../src/fault";
import { MemIo } from "../src/io";

class Fake extends MemIo {
  outCalls: string[] = [];

  override out(text: string): void {
    this.outCalls.push(text);
    super.out(text);
  }
}

test.each<{ text: string; exit: number; output: string }>([
  { text: "", exit: 0, output: "0 queries checked, 0 problems\n" },
  { text: "$.a", exit: 0, output: "1 query checked, 0 problems\n" },
  { text: "$.a\r\n$.b\r\n", exit: 0, output: "2 queries checked, 0 problems\n" },
  {
    text: "$.a\r",
    exit: 1,
    output: "t.txt:1:5: JP003 unexpected end\n1 query checked, 1 problem\n",
  },
  { text: "$.a\r.b", exit: 0, output: "1 query checked, 0 problems\n" },
  {
    text: "\uFEFF$.a\n",
    exit: 1,
    output: 't.txt:1:1: JP001 query must start with "$"\n1 query checked, 1 problem\n',
  },
  {
    text: "\n$[::0]\n",
    exit: 1,
    output: "t.txt:2:3: JP102 step 0 selects nothing\n1 query checked, 1 problem\n",
  },
  {
    text: "$.a\u2028b\u0085\u2029\u3000\n$['\u00A0\u200B']",
    exit: 0,
    output: "2 queries checked, 0 problems\n",
  },
])("runCheck reports physical lines from a MemIo file", ({ text, exit, output }) => {
  const io = new Fake(new Uint8Array(), { "t.txt": new TextEncoder().encode(text) });
  const actual = runCheck(["t.txt"], io);

  expect(actual).toBe(exit);
  expect(io.stdout).toBe(output);
  expect(io.stderr).toBe("");
  expect(io.outCalls).toEqual([output]);
});

test.each<{ text: string; output: string }>([
  {
    text: "$[?@.*==1&&]",
    output: 't.txt:1:12: JP002 unexpected "]"\n1 query checked, 1 problem\n',
  },
  {
    text: "$[?@[0,0]==2 || @.b[?-1<0]]",
    output: "t.txt:1:4: JP010 not a singular query\n1 query checked, 1 problem\n",
  },
  {
    text: "$[0,0]x",
    output: 't.txt:1:7: JP002 unexpected "x"\n1 query checked, 1 problem\n',
  },
  {
    text: "$['a','b','a']\n$[3:3]\n$[?1==1]\n$[::0]\n$.a[1,1]..b[*,*]\n$.x[2:1:-1,5:5]\n$[?@[0,0]==2 || @.b[?-1<0]]\n$.ok[1:3]\n",
    output:
      "t.txt:1:11: JP101 repeated selector\nt.txt:2:3: JP104 slice selects nothing\nt.txt:3:4: JP103 comparison of two literals\nt.txt:4:3: JP102 step 0 selects nothing\nt.txt:5:7: JP101 repeated selector\nt.txt:5:15: JP101 repeated selector\nt.txt:6:12: JP104 slice selects nothing\nt.txt:7:4: JP010 not a singular query\n8 queries checked, 8 problems\n",
  },
])(
  "runCheck reports syntax faults before lint and preserves recursive findings",
  ({ text, output }) => {
    const io = new Fake(new Uint8Array(), { "t.txt": new TextEncoder().encode(text) });
    const actual = runCheck(["t.txt"], io);

    expect(actual).toBe(1);
    expect(io.stdout).toBe(output);
    expect(io.stderr).toBe("");
    expect(io.outCalls).toEqual([output]);
  },
);

test("runCheck matches the complete eight-line worked report", () => {
  const text =
    "$['a','b','a']\n$[3:3]\n$[?1==1]\n$[::0]\n$.a[1,1]..b[*,*]\n$.x[2:1:-1,5:5]\n$[?@[0,0]==2 || @.b[?-1<0]]\n$.ok[1:3]\n";
  const output =
    "t.txt:1:11: JP101 repeated selector\nt.txt:2:3: JP104 slice selects nothing\nt.txt:3:4: JP103 comparison of two literals\nt.txt:4:3: JP102 step 0 selects nothing\nt.txt:5:7: JP101 repeated selector\nt.txt:5:15: JP101 repeated selector\nt.txt:6:12: JP104 slice selects nothing\nt.txt:7:4: JP010 not a singular query\n8 queries checked, 8 problems\n";
  const io = new Fake(new Uint8Array(), { "t.txt": new TextEncoder().encode(text) });

  expect(runCheck(["t.txt"], io)).toBe(1);
  expect(io.stdout).toBe(output);
  expect(io.stderr).toBe("");
  expect(io.outCalls).toEqual([output]);
});

test.each<{
  args: string[];
  stdin: Uint8Array<ArrayBuffer>;
  files: Record<string, Uint8Array<ArrayBuffer>>;
  failure: string | undefined;
  exit: number | undefined;
  output: string;
}>([
  {
    args: [],
    stdin: new Uint8Array(),
    files: {},
    failure: "usage: nodepluck check FILE...",
    exit: undefined,
    output: "",
  },
  {
    args: ["--oops"],
    stdin: new Uint8Array(),
    files: {},
    failure: 'unknown option "--oops"',
    exit: undefined,
    output: "",
  },
  {
    args: ["--"],
    stdin: new Uint8Array(),
    files: {},
    failure: 'unknown option "--"',
    exit: undefined,
    output: "",
  },
  {
    args: ["--help"],
    stdin: new Uint8Array(),
    files: {},
    failure: 'unknown option "--help"',
    exit: undefined,
    output: "",
  },
  {
    args: ["t.txt", "u.txt"],
    stdin: new Uint8Array(),
    files: {
      "t.txt": new TextEncoder().encode("$[::0]\n"),
      "u.txt": new TextEncoder().encode("$[3:3]\n"),
    },
    failure: undefined,
    exit: 1,
    output:
      "t.txt:1:3: JP102 step 0 selects nothing\nu.txt:1:3: JP104 slice selects nothing\n2 queries checked, 2 problems\n",
  },
  {
    args: ["t.txt", "missing\u200Bé.txt"],
    stdin: new Uint8Array(),
    files: { "t.txt": new TextEncoder().encode("$[::0]\n") },
    failure: "missing??.txt: cannot read the file",
    exit: undefined,
    output: "",
  },
  {
    args: ["t.txt", "u.txt"],
    stdin: new Uint8Array(),
    files: {
      "t.txt": new TextEncoder().encode("$[::0]\n"),
      "u.txt": new Uint8Array([36, 46, 97, 10, 233, 10]),
    },
    failure: "u.txt: input is not valid UTF-8",
    exit: undefined,
    output: "",
  },
  {
    args: ["-"],
    stdin: new TextEncoder().encode("$[::0]\n"),
    files: {},
    failure: undefined,
    exit: 1,
    output: "<stdin>:1:3: JP102 step 0 selects nothing\n1 query checked, 1 problem\n",
  },
  {
    args: ["-", "-"],
    stdin: new TextEncoder().encode("$[::0]\n"),
    files: {},
    failure: "standard input is named twice",
    exit: undefined,
    output: "",
  },
  {
    args: ["-x"],
    stdin: new Uint8Array(),
    files: { "-x": new TextEncoder().encode("$") },
    failure: undefined,
    exit: 0,
    output: "1 query checked, 0 problems\n",
  },
])(
  "runCheck validates arguments and buffers reports across inputs",
  ({ args, stdin, files, failure, exit, output }) => {
    const io = new Fake(stdin, files);

    if (failure !== undefined) {
      expect(() => runCheck(args, io)).toThrow(new Failure(failure));
      expect(io.stdout).toBe("");
      expect(io.stderr).toBe("");
      expect(io.outCalls).toEqual([]);
    } else {
      if (exit === undefined) {
        throw new Error("successful fixture must have an exit code");
      }
      expect(runCheck(args, io)).toBe(exit);
      expect(io.stdout).toBe(output);
      expect(io.stderr).toBe("");
      expect(io.outCalls).toEqual([output]);
    }
  },
);
