import type { Io } from "./io";
import { need, parse } from "./options";
import { readQuery } from "./parse";
import { show, table } from "./text";

export const USAGE = "nodepluck explain QUERY";

export function runExplain(args: string[], io: Io): number {
  const parsed = parse(args, []);
  need(USAGE, parsed.args, 1, 1);
  const query = readQuery(parsed.args[0] ?? "");

  const rows: string[][] = [];
  let selectorNumber = 0;
  for (let segmentIndex = 0; segmentIndex < query.segments.length; segmentIndex += 1) {
    const segment = query.segments[segmentIndex];
    if (segment === undefined) {
      continue;
    }
    for (const selector of segment.selectors) {
      selectorNumber += 1;
      let kind: string;
      let detail: string;
      switch (selector.kind) {
        case "name":
          kind = "name";
          detail = show(selector.name);
          break;
        case "wild":
          kind = "wildcard";
          detail = "-";
          break;
        case "index":
          kind = "index";
          detail = String(selector.index);
          break;
        case "slice":
          kind = "slice";
          detail = `${selector.start === null ? "-" : String(selector.start)}:${selector.end === null ? "-" : String(selector.end)}:${selector.step === null ? "1" : String(selector.step)}`;
          break;
        case "filter":
          kind = "filter";
          detail = show(selector.source);
          break;
      }
      rows.push([
        String(selectorNumber),
        String(segmentIndex + 1),
        String(selector.col),
        segment.mode,
        kind,
        detail,
      ]);
    }
  }

  const lines = table(["N", "SEG", "COL", "MODE", "SELECTOR", "DETAIL"], rows);
  if (lines.length === 0) {
    return 1;
  }
  io.out(`${lines.join("\n")}\n`);
  return 0;
}
