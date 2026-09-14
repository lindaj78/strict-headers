import { describeChar } from "./errors";
import { TCHAR } from "./grammar";
import { isValidValueChar } from "./parser";

export interface HeaderLike {
  name: string;
  value: string;
}

/**
 * Turns structured headers back into a raw header block: one CRLF-terminated
 * "name: value" line per header, followed by the blank line that marks the
 * end of the header section, the same shape parseHeaders expects as input.
 *
 * Every name and value is checked against the same grammar parseHeaders
 * enforces before it's written, so writeHeaders can't hand back a block that
 * parseHeaders would then turn around and reject - and leading/trailing
 * whitespace on a value is rejected outright rather than silently written,
 * since parseHeaders would strip it on the way back in and the round trip
 * would quietly change the value.
 */
export function writeHeaders(headers: readonly HeaderLike[]): string {
  let out = "";
  for (const header of headers) {
    checkName(header.name);
    checkValue(header.value);
    out += header.value.length > 0 ? `${header.name}: ${header.value}\r\n` : `${header.name}:\r\n`;
  }
  return out + "\r\n";
}

function checkName(name: string): void {
  if (name.length === 0) {
    throw new TypeError("header name cannot be empty");
  }
  for (let i = 0; i < name.length; i++) {
    const ch = name[i] as string;
    if (!TCHAR.test(ch)) {
      throw new TypeError(`invalid character ${describeChar(ch)} in header name '${name}'`);
    }
  }
}

function checkValue(value: string): void {
  if (value.length > 0 && (value[0] === " " || value[0] === "\t")) {
    throw new TypeError(`header value cannot start with leading whitespace: '${value}'`);
  }
  if (value.length > 0 && (value[value.length - 1] === " " || value[value.length - 1] === "\t")) {
    throw new TypeError(`header value cannot end with trailing whitespace: '${value}'`);
  }
  for (let i = 0; i < value.length; i++) {
    if (!isValidValueChar(value.charCodeAt(i))) {
      throw new TypeError(`invalid character ${describeChar(value[i] as string)} in header value '${value}'`);
    }
  }
}
