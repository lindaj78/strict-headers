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

### Well-known headers

A couple of headers have a value grammar of their own, and a value can be
valid field-value syntax while still being wrong for the header it's on. For
these, `parseHeaders` also checks the value against its specific grammar:

- `Content-Length` must be `1*DIGIT` (RFC 9110 §8.6) - no sign, no decimal
  point, no stray characters.
- `Content-Type` must be `type/subtype` optionally followed by `; name=value`
  parameters (RFC 9110 §8.3), with quoted-string parameter values supported.

```ts
parseHeaders("Content-Length: 12mb\r\n\r\n");
// throws HeaderParseError:
// Content-Length must be a non-negative integer, found 'm' (line 1, column 19)
```

A header that fails this check is reported the same way a structurally bad
line is - one bad line throws its `HeaderParseError` directly, more than one
throws them batched in a `HeaderParseErrors`, and the header is left out of
the returned array. Headers other than these two are passed through without
semantic checks.

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

## Serializing

`writeHeaders` goes the other direction: structured `{ name, value }` pairs
back to a raw, CRLF-terminated header block, including the trailing blank
line.

```ts
import { writeHeaders } from "strict-headers";

writeHeaders([
  { name: "Host", value: "example.com" },
  { name: "Content-Type", value: "application/json" },
]);
// "Host: example.com\r\nContent-Type: application/json\r\n\r\n"
```

It checks each name and value against the same grammar `parseHeaders`
enforces and throws a `TypeError` if either is invalid, so it can't produce a
block that `parseHeaders` would then refuse to read back. A value with
leading or trailing whitespace is also rejected, rather than written as-is,
since `parseHeaders` strips that whitespace on the way back in and the round
trip would otherwise quietly change the value.

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

Early. Parsing collects every malformed line in a block instead of stopping
at the first one, checks `Content-Length` and `Content-Type` values against
their own grammar on top of the general field-value syntax, and `writeHeaders`
serializes structured headers back to raw text. Still missing: support for a
few other things - see the roadmap.

### Roadmap

- Support bare CR line endings, not just CRLF and LF.
- Configurable duplicate-header detection (reject, keep first, keep last, or
  combine per RFC 9110 §5.3).
- A streaming parser for chunked input.
- A test suite.
