import type { Selector } from "./ast";
import { Failure, Fault } from "./fault";
import type { Io } from "./io";
import { scanLength, skipBlank, unexpected } from "./lex";
import { parse } from "./options";
import { parseSelector } from "./parse";
import { sliceIndexes } from "./slice";
import { codePoints, hasSurrogate, show } from "./text";

export const USAGE = "nodepluck slice SPEC LENGTH";

export function runSlice(argv: string[], io: Io): number {
  const parsed = parse(argv, []);
  const args = parsed.args;
  if (args.length !== 2) {
    throw new Failure(`usage: ${USAGE}`);
  }

  const spec = args[0];
  const lengthText = args[1];
  if (spec === undefined || lengthText === undefined) {
    throw new Failure(`usage: ${USAGE}`);
  }
  if (hasSurrogate(spec)) {
    throw new Failure(`invalid text ${show(spec)}`);
  }
  if (hasSurrogate(lengthText)) {
    throw new Failure(`invalid text ${show(lengthText)}`);
  }

  const lengthScan = scanLength(codePoints(lengthText));
  if (lengthScan === null) {
    throw new Failure(`bad length ${show(lengthText)}`);
  }

  const points = codePoints(spec);
  let selector: Selector;
  try {
    const start = skipBlank(points, 0);
    const parsedSelector = parseSelector(points, start, 0);
    const end = skipBlank(points, parsedSelector.next);
    if (end !== points.length) {
      throw unexpected(points, end);
    }
    selector = parsedSelector.selector;
  } catch (error) {
    if (error instanceof Fault) {
      throw new Failure(`slice:${error.col}: ${error.code} ${error.text}`);
    }
    throw error;
  }

  if (selector.kind !== "slice") {
    throw new Failure(`not a slice ${show(spec)}`);
  }

  const indexes = sliceIndexes(selector.start, selector.end, selector.step, lengthScan.value);
  if (indexes.length === 0) {
    return 1;
  }

  io.out(`${indexes.join("\n")}\n`);
  return 0;
}
