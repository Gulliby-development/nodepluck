export function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;

  while (true) {
    const newline = text.indexOf("\n", start);
    if (newline < 0) {
      lines.push(text.slice(start));
      return lines;
    }

    const end = newline > start && text.charCodeAt(newline - 1) === 0x0d ? newline - 1 : newline;
    lines.push(text.slice(start, end));
    start = newline + 1;
  }
}
