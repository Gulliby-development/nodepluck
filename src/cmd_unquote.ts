import { Failure, Fault } from "./fault";
import type { Io } from "./io";
import { scanString, unexpected } from "./lex";
import { need, parse } from "./options";
import { codePoints, hasSurrogate, show } from "./text";

export const USAGE = "nodepluck unquote LITERAL";

export function runUnquote(args: string[], io: Io): number {
  const parsed = parse(args, []);
  need(USAGE, parsed.args, 1, 1);

  const literal = parsed.args[0];
  if (literal === undefined) {
    throw new Failure(`usage: ${USAGE}`);
  }
  if (hasSurrogate(literal)) {
    throw new Failure(`invalid text ${show(literal)}`);
  }

  const points = codePoints(literal);
  let decoded: string;
  try {
    const scanned = scanString(points, 0);
    if (scanned.next !== points.length) {
      throw unexpected(points, scanned.next);
    }
    decoded = scanned.value;
  } catch (error) {
    if (error instanceof Fault) {
      throw new Failure(`literal:${error.col}: ${error.code} ${error.text}`);
    }
    throw error;
  }

  io.out(decoded);
  return 0;
}
