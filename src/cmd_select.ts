import { select } from "./evaluate";
import { Inputs, type Io } from "./io";
import { render } from "./jvalue";
import { loadDocument } from "./load";
import { normalized } from "./npath";
import { need, parse } from "./options";
import { readQuery } from "./parse";

export const USAGE = "nodepluck select [--paths] QUERY DOC";

export function runSelect(args: string[], io: Io): number {
  const parsed = parse(args, ["--paths"]);
  need(USAGE, parsed.args, 2, 2);

  const query = readQuery(parsed.args[0] ?? "");
  const source = new Inputs(io).read(parsed.args[1] ?? "");
  const document = loadDocument(source);
  const nodes = select(query, document);

  if (nodes.length === 0) {
    return 1;
  }

  const withPaths = parsed.flags.has("--paths");
  const output = nodes
    .map((node) => {
      const value = render(node.value);
      return withPaths ? `${normalized(node.path)}\t${value}\n` : `${value}\n`;
    })
    .join("");
  io.out(output);
  return 0;
}
