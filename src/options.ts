import { Failure } from "./fault";
import { show } from "./text";

export type Parsed = {
  flags: Set<string>;
  args: string[];
};

export function parse(argv: string[], specs: string[]): Parsed {
  const flags = new Set<string>();
  const args: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      if (!specs.includes(arg)) {
        throw new Failure(`unknown option ${show(arg)}`);
      }
      flags.add(arg);
    } else {
      args.push(arg);
    }
  }

  return { flags, args };
}

export function need(words: string, args: string[], low: number, high: number): void {
  if (args.length < low || (high >= 0 && args.length > high)) {
    throw new Failure(`usage: ${words}`);
  }
}
