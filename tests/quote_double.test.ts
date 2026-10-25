import { expect, test } from "bun:test";
import { run } from "../src/cli";
import { runQuote } from "../src/cmd_quote";
import { runUnquote } from "../src/cmd_unquote";
import { Failure } from "../src/fault";
import { MemIo } from "../src/io";
import { normalized, quoteName } from "../src/npath";

test("quote --double accepts flags before, after, and repeated around text", () => {
  const abcIo = new MemIo();
  expect(runQuote(["--double", "abc"], abcIo)).toBe(0);
  expect(abcIo.stdout).toBe('"abc"');
  expect(abcIo.stderr).toBe("");

  const emptyIo = new MemIo();
  expect(runQuote(["--double", ""], emptyIo)).toBe(0);
  expect(emptyIo.stdout).toBe('""');
  expect(emptyIo.stderr).toBe("");

  const trailingFlagIo = new MemIo();
  expect(runQuote(["abc", "--double"], trailingFlagIo)).toBe(0);
  expect(trailingFlagIo.stdout).toBe('"abc"');
  expect(trailingFlagIo.stderr).toBe("");

  const repeatedFlagIo = new MemIo();
  expect(runQuote(["--double", "abc", "--double"], repeatedFlagIo)).toBe(0);
  expect(repeatedFlagIo.stdout).toBe('"abc"');
  expect(repeatedFlagIo.stderr).toBe("");
});

test("quote --double escapes delimiters and backslashes", () => {
  const doubleQuoteIo = new MemIo();
  expect(runQuote(["--double", 'say "hi"'], doubleQuoteIo)).toBe(0);
  expect(doubleQuoteIo.stdout).toBe('"say \\"hi\\""');
  expect(doubleQuoteIo.stderr).toBe("");

  const apostropheIo = new MemIo();
  expect(runQuote(["--double", "it's"], apostropheIo)).toBe(0);
  expect(apostropheIo.stdout).toBe('"it\'s"');
  expect(apostropheIo.stderr).toBe("");

  const backslashIo = new MemIo();
  expect(runQuote(["--double", "\\"], backslashIo)).toBe(0);
  expect(backslashIo.stdout).toBe('"\\\\"');
  expect(backslashIo.stderr).toBe("");

  const pathLikeIo = new MemIo();
  expect(runQuote(["--double", "$['a']"], pathLikeIo)).toBe(0);
  expect(pathLikeIo.stdout).toBe("\"$['a']\"");
  expect(pathLikeIo.stderr).toBe("");
});

test("quote --double preserves short controls, other controls, and Unicode", () => {
  const shortControlsIo = new MemIo();
  expect(runQuote(["--double", "\b\f\n\r\t"], shortControlsIo)).toBe(0);
  expect(shortControlsIo.stdout).toBe('"\\b\\f\\n\\r\\t"');
  expect(shortControlsIo.stderr).toBe("");

  const otherControlsIo = new MemIo();
  expect(runQuote(["--double", "\u0000\u001f"], otherControlsIo)).toBe(0);
  expect(otherControlsIo.stdout).toBe('"\\u0000\\u001f"');
  expect(otherControlsIo.stderr).toBe("");

  const unicodeIo = new MemIo();
  expect(runQuote(["--double", "é😀/"], unicodeIo)).toBe(0);
  expect(unicodeIo.stdout).toBe('"é😀/"');
  expect(unicodeIo.stderr).toBe("");
});

test("default quoting and normalized paths keep single quotes", () => {
  const defaultDoubleQuoteIo = new MemIo();
  expect(runQuote(['say "hi"'], defaultDoubleQuoteIo)).toBe(0);
  expect(defaultDoubleQuoteIo.stdout).toBe("'say \"hi\"'");
  expect(defaultDoubleQuoteIo.stderr).toBe("");

  const defaultApostropheIo = new MemIo();
  expect(runQuote(["it's"], defaultApostropheIo)).toBe(0);
  expect(defaultApostropheIo.stdout).toBe("'it\\'s'");
  expect(defaultApostropheIo.stderr).toBe("");

  expect(quoteName("a'b")).toBe("'a\\'b'");
  expect(quoteName('a"b', '"')).toBe('"a\\"b"');
  expect(normalized(["k'", 'k"'])).toBe("$['k\\'']['k\"']");
});

test("unquote reads the output of double-quoted text", () => {
  const quoteIo = new MemIo();
  expect(runQuote(["--double", 'say "hi"'], quoteIo)).toBe(0);
  expect(quoteIo.stdout).toBe('"say \\"hi\\""');
  expect(quoteIo.stderr).toBe("");

  const unquoteIo = new MemIo();
  expect(runUnquote([quoteIo.stdout], unquoteIo)).toBe(0);
  expect(unquoteIo.stdout).toBe('say "hi"');
  expect(unquoteIo.stderr).toBe("");
});

test("quote reports the exact direct argument failures", () => {
  const missingIo = new MemIo();
  expect(() => runQuote(["--double"], missingIo)).toThrow(
    new Failure("usage: nodepluck quote [--double] TEXT"),
  );
  expect(missingIo.stdout).toBe("");

  const excessIo = new MemIo();
  expect(() => runQuote(["--double", "a", "b"], excessIo)).toThrow(
    new Failure("usage: nodepluck quote [--double] TEXT"),
  );
  expect(excessIo.stdout).toBe("");

  const wrongCaseIo = new MemIo();
  expect(() => runQuote(["--Double", "a"], wrongCaseIo)).toThrow(
    new Failure('unknown option "--Double"'),
  );
  expect(wrongCaseIo.stdout).toBe("");

  const unknownOptionIo = new MemIo();
  expect(() => runQuote(["--double", "--single", "a"], unknownOptionIo)).toThrow(
    new Failure('unknown option "--single"'),
  );
  expect(unknownOptionIo.stdout).toBe("");

  const terminatorIo = new MemIo();
  expect(() => runQuote(["--"], terminatorIo)).toThrow(new Failure('unknown option "--"'));
  expect(terminatorIo.stdout).toBe("");

  const surrogateIo = new MemIo();
  expect(() => runQuote(["--double", "a\ud800"], surrogateIo)).toThrow(
    new Failure('invalid text "a?"'),
  );
  expect(surrogateIo.stdout).toBe("");
});

test("quote command-line dispatch preserves status and output channels", () => {
  const successIo = new MemIo();
  expect(run(["quote", "--double", "x"], successIo)).toBe(0);
  expect(successIo.stdout).toBe('"x"');
  expect(successIo.stderr).toBe("");

  const usageIo = new MemIo();
  expect(run(["quote", "--double"], usageIo)).toBe(2);
  expect(usageIo.stdout).toBe("");
  expect(usageIo.stderr).toBe("nodepluck: usage: nodepluck quote [--double] TEXT\n");
});

test("README documents the double-quoted literal example", async () => {
  const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

  expect(readme).toContain("usage: nodepluck quote [--double] TEXT");
  expect(readme).toContain("bun src/main.ts quote --double 'say \"hi\"'");
  expect(readme).toContain('```text\n"say \\"hi\\""\n```');
});
