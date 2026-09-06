# strict-headers

A small TypeScript library for parsing raw HTTP header blocks - the text
between a request or response's start line and the blank line before the
body - into structured `{ name, value }` pairs.

Most header parsers either accept whatever garbage you throw at them or fail
with something like `Error: invalid header`, leaving you to count characters
by hand to find the problem. This one validates against the field-name and
field-value grammar in RFC 9110 / RFC 7230 and, when a line is malformed,
points at the exact line and column, the same way a compiler error would.

No dependencies. No build tooling beyond `tsc`. No executable - it's a
library you import.

## Usage

```ts
import { parseHeaders } from "strict-headers";

const raw = [
  "Host: example.com",
  "Content-Type: application/json",
  "X-Request-Id: 4b2f-91a",
  "",
].join("\r\n");

const headers = parseHeaders(raw);
// [
//   { name: "Host", value: "example.com", line: 1 },
//   { name: "Content-Type", value: "application/json", line: 2 },
//   { name: "X-Request-Id", value: "4b2f-91a", line: 3 },
// ]
```

Parsing stops at the first blank line, so it's safe to pass a whole raw
response (headers plus body) and only the header section will be read.

## Error messages

Given a malformed block:

```ts
import { parseHeaders, HeaderParseError } from "strict-headers";

const raw = "Host: example.com\r\nX Forwarded For: 10.0.0.1\r\n";

try {
  parseHeaders(raw);
} catch (err) {
  if (err instanceof HeaderParseError) {
    console.error(err.message);
    console.error(err.line, err.column);
  }
}
```

prints:

```
invalid character ' ' (space) in field name (line 2, column 2)
  |
2 | X Forwarded For: 10.0.0.1
  |  ^
```

`HeaderParseError` also carries `line`, `column`, `reason`, and `sourceLine`
as plain properties, so you can build your own presentation (a diagnostics
panel, an LSP-style squiggly, whatever) instead of the pre-formatted string.

Other things it catches: an empty field name, a line with no `:`, whitespace
between the field name and the colon (a known request-smuggling vector when
two servers disagree on which side of the whitespace is authoritative), an
obsolete folded continuation line, and control characters in a field value.

### Multiple bad lines

A single malformed line throws that line's `HeaderParseError` directly, as
above. If a block has more than one bad line, `parseHeaders` throws
`HeaderParseErrors` instead, which carries every offending line's
`HeaderParseError` in its `errors` array so you don't have to fix them one at
a time and re-run the parser:

```ts
import { parseHeaders, HeaderParseErrors } from "strict-headers";

try {
  parseHeaders(raw);
} catch (err) {
  if (err instanceof HeaderParseErrors) {
    for (const single of err.errors) {
      console.error(single.message);
    }
  }
}
```

## Grammar notes

The parser follows RFC 9110 §5 and RFC 7230 §3.2:

- A field name is one or more `tchar` characters (letters, digits, and
  `!#$%&'*+-.^_\`|~`) followed immediately by `:` - no whitespace before it.
- A field value is `field-vchar` (visible ASCII, `0x21`-`0x7e`), space, or
  tab, plus `obs-text` (`0x80`-`0xff`) for legacy Latin-1 values. Leading and
  trailing whitespace is stripped.
- Obsolete line folding (a continuation line starting with a space or tab) is
  rejected rather than silently un-folded, since RFC 7230 §3.2.4 says a
  recipient that doesn't have a specific reason to support it should reject
  the message outright.

## Installing

There's no published package yet. Compile it yourself:

```
tsc
```

`dist/` is not checked in; run the build to get `dist/index.js` and
`dist/index.d.ts`.

## Status

Early. Parsing now collects every malformed line in a block instead of
stopping at the first one. See the issues / roadmap for what's still
missing - notably, there's no semantic validation of well-known headers yet
(e.g. rejecting a non-numeric `Content-Length`).
