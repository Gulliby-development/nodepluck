import { Fault } from "./fault";
import { Inputs, type Io } from "./io";
import { splitLines } from "./lines";
import { need, parse } from "./options";
import { parseQuery } from "./parse";
import { render, sortedProblems } from "./problem";
import { findProblems } from "./rules";
import { plural } from "./text";

export const USAGE = "nodepluck check FILE...";

export function runCheck(args: string[], io: Io): number {
  const parsed = parse(args, []);
  need(USAGE, parsed.args, 1, -1);

  const inputs = new Inputs(io);
  const report: string[] = [];
  let queryCount = 0;
  let problemCount = 0;

  for (const arg of parsed.args) {
    const source = inputs.read(arg);
    const lines = splitLines(source.text);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === undefined || line === "") {
        continue;
      }

      queryCount += 1;
      let parsedQuery: { query: ReturnType<typeof parseQuery> } | { fault: Fault };
      try {
        parsedQuery = { query: parseQuery(line) };
      } catch (error) {
        if (!(error instanceof Fault)) {
          throw error;
        }
        parsedQuery = { fault: error };
      }
      const problems =
        "fault" in parsedQuery
          ? [
              {
                col: parsedQuery.fault.col,
                code: parsedQuery.fault.code,
                text: parsedQuery.fault.text,
              },
            ]
          : sortedProblems(findProblems(parsedQuery.query));

      for (const problem of problems) {
        report.push(render(source.display, index + 1, problem));
        problemCount += 1;
      }
    }
  }

  report.push(
    `${plural(queryCount, "query", "queries")} checked, ${plural(problemCount, "problem")}`,
  );
  io.out(`${report.join("\n")}\n`);
  return problemCount === 0 ? 0 : 1;
}
