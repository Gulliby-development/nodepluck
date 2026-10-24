export function codePoints(text: string): string[] {
  return Array.from(text);
}

export function plain(text: string): string {
  return codePoints(text)
    .map((point) => {
      const code = point.codePointAt(0);
      return code !== undefined && code >= 0x20 && code <= 0x7e ? point : "?";
    })
    .join("");
}

export function show(text: string): string {
  return `"${plain(text)}"`;
}

export function hasSurrogate(text: string): boolean {
  let index = 0;
  while (index < text.length) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff || index + 1 >= text.length) {
        return true;
      }
      index += 2;
    } else {
      if (unit >= 0xdc00 && unit <= 0xdfff) {
        return true;
      }
      index += 1;
    }
  }
  return false;
}

export function isAlpha(value: string): boolean {
  if (value.length !== 1) {
    return false;
  }
  const code = value.charCodeAt(0);
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

export function isDigit(value: string): boolean {
  if (value.length !== 1) {
    return false;
  }
  const code = value.charCodeAt(0);
  return code >= 0x30 && code <= 0x39;
}

export function isHex(value: string): boolean {
  if (value.length !== 1) {
    return false;
  }
  const code = value.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x46) ||
    (code >= 0x61 && code <= 0x66)
  );
}

export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

export function table(header: string[], rows: string[][]): string[] {
  if (rows.length === 0) {
    return [];
  }

  const allRows = [header, ...rows];
  const columnCount = allRows.reduce((count, row) => Math.max(count, row.length), 0);
  const widths = Array.from({ length: columnCount }, (_, column) =>
    allRows.reduce((width, row) => Math.max(width, codePoints(row[column] ?? "").length), 0),
  );

  return allRows.map((row) => {
    const line = Array.from({ length: columnCount }, (_, column) => {
      const cell = row[column] ?? "";
      if (column === columnCount - 1) {
        return cell;
      }
      const padding = widths[column] - codePoints(cell).length;
      return cell + " ".repeat(padding);
    }).join("  ");

    let end = line.length;
    while (end > 0 && line.charCodeAt(end - 1) === 0x20) {
      end -= 1;
    }
    return line.slice(0, end);
  });
}
