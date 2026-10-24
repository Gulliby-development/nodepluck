import { USAGE as CHECK_USAGE, runCheck } from "./check";
import { USAGE as EXPLAIN_USAGE, runExplain } from "./cmd_explain";
import { USAGE as QUOTE_USAGE, runQuote } from "./cmd_quote";
import { runSelect, USAGE as SELECT_USAGE } from "./cmd_select";
import { runSlice, USAGE as SLICE_USAGE } from "./cmd_slice";
import { runUnquote, USAGE as UNQUOTE_USAGE } from "./cmd_unquote";
import { Failure } from "./fault";
import type { Io } from "./io";
import { show } from "./text";

interface Command {
  name: string;
  usage: string;
  run(args: string[], io: Io): number;
}

const commands: Command[] = [
  { name: "select", usage: SELECT_USAGE, run: runSelect },
  { name: "explain", usage: EXPLAIN_USAGE, run: runExplain },
  { name: "slice", usage: SLICE_USAGE, run: runSlice },
  { name: "quote", usage: QUOTE_USAGE, run: runQuote },
  { name: "unquote", usage: UNQUOTE_USAGE, run: runUnquote },
  { name: "check", usage: CHECK_USAGE, run: runCheck },
];

export function run(argv: string[], io: Io): number {
  try {
    const first = argv[0];
    if (first === undefined) {
      throw new Failure("missing command (select, explain, slice, quote, unquote or check)");
    }

    if (first === "--help" && argv.length === 1) {
      io.out(`${commands.map((command) => `usage: ${command.usage}`).join("\n")}\n`);
      return 0;
    }

    const command = commands.find((candidate) => candidate.name === first);
    if (command === undefined) {
      throw new Failure(`unknown command ${show(first)}`);
    }
    return command.run(argv.slice(1), io);
  } catch (error) {
    if (!(error instanceof Failure)) {
      throw error;
    }
    io.err(`nodepluck: ${error.message}\n`);
    return 2;
  }
}
