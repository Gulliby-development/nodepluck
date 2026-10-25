import { Failure } from "./fault";
import type { Io } from "./io";
import { quoteName } from "./npath";
import { need, parse } from "./options";
import { hasSurrogate, show } from "./text";

export const USAGE = "nodepluck quote [--double] TEXT";

export function runQuote(args: string[], io: Io): number {
  const parsed = parse(args, ["--double"]);
  need(USAGE, parsed.args, 1, 1);

  const text = parsed.args[0] ?? "";
  if (hasSurrogate(text)) {
    throw new Failure(`invalid text ${show(text)}`);
  }

  io.out(quoteName(text, parsed.flags.has("--double") ? '"' : "'"));
  return 0;
}
