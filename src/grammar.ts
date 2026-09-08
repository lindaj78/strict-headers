// Shared RFC 9110 / RFC 7230 character classes, used by both the structural
// parser and the well-known-header semantic checks. Kept in their own module
// so parser.ts and semantics.ts (which imports ParsedHeader from parser.ts)
// don't end up importing each other.

// tchar, RFC 9110 §5.6.2 - the set of characters a field name (and a
// Content-Type type/subtype/parameter token) is allowed to use.
export const TCHAR = /[!#$%&'*+\-.^_`|~0-9A-Za-z]/;
