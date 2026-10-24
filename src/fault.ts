import { show } from "./text";

export class Failure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Failure";
  }
}

export class Fault extends Error {
  readonly code: string;
  readonly col: number;
  readonly arg: string;

  constructor(code: string, col: number, arg = "") {
    super();
    this.name = "Fault";
    this.code = code;
    this.col = col;
    this.arg = arg;
  }

  get text(): string {
    switch (this.code) {
      case "JP001":
        return 'query must start with "$"';
      case "JP002":
        return `unexpected ${show(this.arg)}`;
      case "JP003":
        return "unexpected end";
      case "JP004":
        return "bad escape";
      case "JP005":
        return "unterminated string";
      case "JP006":
        return "bad number";
      case "JP007":
        return "number out of range";
      case "JP009":
        return "nested too deeply";
      case "JP010":
        return "not a singular query";
      case "JP011":
        return `unknown function ${show(this.arg)}`;
      case "JP012":
        return `bad arguments for ${show(this.arg)}`;
      case "JP013":
        return "not a condition";
      default:
        return "";
    }
  }
}
