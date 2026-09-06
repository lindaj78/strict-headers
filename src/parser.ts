import { describeChar, HeaderParseError, HeaderParseErrors } from "./errors";

export interface ParsedHeader {
  name: string;
  value: string;
  /** 1-based line number of the header in the original input. */
  line: number;
}

// tchar, RFC 9110 §5.6.2 - the set of characters a field name is allowed to use.
const TCHAR = /[!#$%&'*+\-.^_`|~0-9A-Za-z]/;

/**
 * Parses a raw block of HTTP header lines (the part of a request or response
 * between the start line and the blank line before the body) into structured
 * headers.
 *
 * Every line is checked, not just the first malformed one: a bad line is
 * recorded and skipped so the rest of the block still gets validated. If
 * exactly one line failed, the original HeaderParseError is thrown as before;
 * if more than one failed, a HeaderParseErrors wrapping all of them is thrown
 * instead, so a caller can fix a header block in one pass.
 *
 * A blank line ends the header section, mirroring how HTTP messages work, so
 * it's fine to pass a whole raw response and let this function stop at the body.
 */
export function parseHeaders(input: string): ParsedHeader[] {
  const lines = input.split(/\r\n|\n/);
  const headers: ParsedHeader[] = [];
  const errors: HeaderParseError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] as string;
    const lineNumber = i + 1;

    if (rawLine.length === 0) {
      break;
    }

    if (rawLine[0] === " " || rawLine[0] === "\t") {
      errors.push(
        new HeaderParseError(
          lineNumber,
          1,
          "obsolete line folding is not supported; continuation lines starting with " +
            "whitespace were removed from HTTP/1.1 (RFC 7230 §3.2.4)",
          rawLine,
        ),
      );
      continue;
    }

    try {
      headers.push(parseLine(rawLine, lineNumber));
    } catch (err) {
      if (!(err instanceof HeaderParseError)) {
        throw err;
      }
      errors.push(err);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new HeaderParseErrors(errors);
  }

  return headers;
}

function parseLine(rawLine: string, lineNumber: number): ParsedHeader {
  const colonIndex = rawLine.indexOf(":");

  if (colonIndex === -1) {
    throw new HeaderParseError(
      lineNumber,
      rawLine.length + 1,
      "expected ':' after field name, found end of line",
      rawLine,
    );
  }
  if (colonIndex === 0) {
    throw new HeaderParseError(lineNumber, 1, "field name cannot be empty", rawLine);
  }

  for (let i = 0; i < colonIndex; i++) {
    const ch = rawLine[i] as string;
    if (TCHAR.test(ch)) {
      continue;
    }
    if ((ch === " " || ch === "\t") && i === colonIndex - 1) {
      throw new HeaderParseError(
        lineNumber,
        i + 1,
        "whitespace is not allowed between the field name and ':' " +
          "(RFC 7230 §3.2.4 - historically a request-smuggling vector between mismatched parsers)",
        rawLine,
      );
    }
    throw new HeaderParseError(lineNumber, i + 1, `invalid character ${describeChar(ch)} in field name`, rawLine);
  }

  const name = rawLine.slice(0, colonIndex);

  for (let i = colonIndex + 1; i < rawLine.length; i++) {
    const code = rawLine.charCodeAt(i);
    if (!isValidValueChar(code)) {
      throw new HeaderParseError(
        lineNumber,
        i + 1,
        `invalid character ${describeChar(rawLine[i] as string)} in field value`,
        rawLine,
      );
    }
  }

  const value = trimOptionalWhitespace(rawLine.slice(colonIndex + 1));

  return { name, value, line: lineNumber };
}

// field-vchar, RFC 9110 §5.5 - VCHAR, SP, HTAB, plus obs-text (0x80-0xFF) for
// legacy servers that stuff latin-1 into header values.
function isValidValueChar(code: number): boolean {
  if (code === 0x09 || code === 0x20) return true;
  if (code >= 0x21 && code <= 0x7e) return true;
  if (code >= 0x80 && code <= 0xff) return true;
  return false;
}

function trimOptionalWhitespace(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, "");
}
