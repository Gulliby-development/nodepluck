import { Failure } from "./fault";
import { plain } from "./text";

export interface Source {
  display: string;
  text: string;
}

export interface Io {
  readStdin(): Uint8Array;
  readFile(path: string): Uint8Array;
  out(text: string): void;
  err(text: string): void;
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

export class Inputs {
  private stdinRead = false;

  constructor(private readonly io: Io) {}

  read(arg: string): Source {
    const isStdin = arg === "-";
    const display = isStdin ? "<stdin>" : plain(arg);

    if (isStdin && this.stdinRead) {
      throw new Failure("standard input is named twice");
    }
    if (isStdin) {
      this.stdinRead = true;
    }

    let bytes: Uint8Array;
    try {
      bytes = isStdin ? this.io.readStdin() : this.io.readFile(arg);
    } catch {
      throw new Failure(`${display}: cannot read the file`);
    }

    let text: string;
    try {
      text = decodeUtf8(bytes);
    } catch {
      throw new Failure(`${display}: input is not valid UTF-8`);
    }

    return { display, text };
  }
}

export class MemIo implements Io {
  stdout = "";
  stderr = "";

  constructor(
    private readonly stdin = new Uint8Array(),
    private readonly files: Record<string, Uint8Array> = {},
  ) {}

  readStdin(): Uint8Array {
    return this.stdin;
  }

  readFile(path: string): Uint8Array {
    if (!Object.hasOwn(this.files, path)) {
      throw new Error("file not found");
    }
    return this.files[path];
  }

  out(text: string): void {
    this.stdout += text;
  }

  err(text: string): void {
    this.stderr += text;
  }
}
