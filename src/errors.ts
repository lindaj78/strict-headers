/**
 * Thrown when a raw header block does not conform to the field-name/field-value
 * grammar in RFC 9110 §5.1 and RFC 7230 §3.2. The message is built to look like
 * a compiler error: the offending line, a caret under the exact column, and a
 * plain-English reason, so a caller doesn't have to eyeball a long header dump.
 */
export class HeaderParseError extends Error {
  readonly line: number;
  readonly column: number;
  readonly reason: string;
  readonly sourceLine: string;

  constructor(line: number, column: number, reason: string, sourceLine: string) {
    super(formatMessage(line, column, reason, sourceLine));
    this.name = "HeaderParseError";
    this.line = line;
    this.column = column;
    this.reason = reason;
    this.sourceLine = sourceLine;
  }
}

function formatMessage(line: number, column: number, reason: string, sourceLine: string): string {
  const lineLabel = String(line);
  const gutter = " ".repeat(lineLabel.length);
  const pointer = " ".repeat(Math.max(0, column - 1)) + "^";

  return [
    `${reason} (line ${line}, column ${column})`,
    `${gutter} |`,
    `${lineLabel} | ${sourceLine}`,
    `${gutter} | ${pointer}`,
  ].join("\n");
}

/**
 * Thrown instead of a single HeaderParseError when a header block has more
 * than one malformed line, so a caller sees every problem in one pass rather
 * than fixing them one at a time by re-running the parser.
 */
export class HeaderParseErrors extends Error {
  readonly errors: HeaderParseError[];

  constructor(errors: HeaderParseError[]) {
    super(formatMultiple(errors));
    this.name = "HeaderParseErrors";
    this.errors = errors;
  }
}

function formatMultiple(errors: HeaderParseError[]): string {
  const summary = `${errors.length} header lines failed to parse:`;
  return [summary, ...errors.map((err) => err.message)].join("\n\n");
}

/** Renders a single character (control chars included) for use inside an error message. */
export function describeChar(ch: string): string {
  switch (ch) {
    case "\t":
      return "'\\t' (tab)";
    case " ":
      return "' ' (space)";
    case "\r":
      return "'\\r' (carriage return)";
  }

  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x20 || code === 0x7f) {
    return `0x${code.toString(16).padStart(2, "0")} (control character)`;
  }
  return `'${ch}'`;
}
