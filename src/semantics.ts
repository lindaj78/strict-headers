import { describeChar, HeaderParseError } from "./errors";
import { TCHAR } from "./grammar";
import type { ParsedHeader } from "./parser";

/**
 * Structural parsing (parseLine) only checks that a header is well-formed
 * field-name/field-value syntax. A handful of headers have a value grammar
 * of their own, and a value that's syntactically fine as a field-value but
 * wrong for the header it's on (a non-numeric Content-Length, a Content-Type
 * missing its subtype) is exactly the kind of bug this library exists to
 * catch early.
 *
 * Only headers with a grammar precise enough to validate without guessing
 * at intent are covered here. Unknown or unrecognized headers are left
 * alone.
 */
export function validateWellKnownHeader(
  header: ParsedHeader,
  rawLine: string,
  lineNumber: number,
): HeaderParseError | null {
  switch (header.name.toLowerCase()) {
    case "content-length":
      return validateContentLength(header, rawLine, lineNumber);
    case "content-type":
      return validateContentType(header, rawLine, lineNumber);
    default:
      return null;
  }
}

// Column of the first character of header.value within rawLine, accounting
// for the optional whitespace between ':' and the value that trimOptionalWhitespace
// (in parser.ts) already stripped off.
function valueStartColumn(rawLine: string, header: ParsedHeader): number {
  const colonIndex = header.name.length;
  const afterColon = rawLine.slice(colonIndex + 1);
  const leadingWs = afterColon.length - afterColon.trimStart().length;
  return colonIndex + 1 + leadingWs + 1;
}

// Content-Length = 1*DIGIT, RFC 9110 §8.6.
function validateContentLength(header: ParsedHeader, rawLine: string, lineNumber: number): HeaderParseError | null {
  const { value } = header;
  const startColumn = valueStartColumn(rawLine, header);

  if (value.length === 0) {
    return new HeaderParseError(
      lineNumber,
      startColumn,
      "Content-Length cannot be empty; expected a non-negative integer",
      rawLine,
    );
  }

  for (let i = 0; i < value.length; i++) {
    const ch = value[i] as string;
    if (ch < "0" || ch > "9") {
      return new HeaderParseError(
        lineNumber,
        startColumn + i,
        `Content-Length must be a non-negative integer, found ${describeChar(ch)}`,
        rawLine,
      );
    }
  }

  return null;
}

// Content-Type = media-type, RFC 9110 §8.3:
//   media-type = type "/" subtype *( OWS ";" OWS parameter )
//   parameter  = token "=" ( token / quoted-string )
function validateContentType(header: ParsedHeader, rawLine: string, lineNumber: number): HeaderParseError | null {
  const { value } = header;
  const startColumn = valueStartColumn(rawLine, header);
  let i = 0;

  const fail = (offset: number, reason: string): HeaderParseError =>
    new HeaderParseError(lineNumber, startColumn + offset, reason, rawLine);

  const readToken = (): string => {
    const start = i;
    while (i < value.length && TCHAR.test(value[i] as string)) i++;
    return value.slice(start, i);
  };

  const skipOptionalWhitespace = (): void => {
    while (value[i] === " " || value[i] === "\t") i++;
  };

  const type = readToken();
  if (type.length === 0) {
    return fail(i, 'Content-Type must start with a media type, e.g. "text/plain"');
  }
  if (value[i] !== "/") {
    return fail(
      i,
      value[i] === undefined
        ? "Content-Type is missing '/' between type and subtype"
        : `Content-Type expected '/' after type, found ${describeChar(value[i] as string)}`,
    );
  }
  i++;

  const subtype = readToken();
  if (subtype.length === 0) {
    return fail(i, "Content-Type is missing a subtype after '/'");
  }

  while (i < value.length) {
    skipOptionalWhitespace();
    if (i >= value.length) break;

    if (value[i] !== ";") {
      return fail(i, `Content-Type expected ';' before next parameter, found ${describeChar(value[i] as string)}`);
    }
    i++;
    skipOptionalWhitespace();

    const paramName = readToken();
    if (paramName.length === 0) {
      return fail(i, "Content-Type parameter is missing a name");
    }
    if (value[i] !== "=") {
      return fail(
        i,
        value[i] === undefined
          ? "Content-Type parameter is missing '=' after name"
          : `Content-Type parameter expected '=' after name, found ${describeChar(value[i] as string)}`,
      );
    }
    i++;

    if (value[i] === '"') {
      const quoteStart = i;
      i++;
      let closed = false;
      while (i < value.length) {
        if (value[i] === "\\" && i + 1 < value.length) {
          i += 2;
          continue;
        }
        if (value[i] === '"') {
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) {
        return fail(quoteStart, "Content-Type parameter has an unterminated quoted string");
      }
    } else {
      const paramValue = readToken();
      if (paramValue.length === 0) {
        return fail(i, "Content-Type parameter is missing a value");
      }
    }
  }

  return null;
}
