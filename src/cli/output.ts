/* eslint-disable no-console */

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

function color(c: string, s: string): string {
  return process.stdout.isTTY ? `${c}${s}${RESET}` : s;
}

export function info(msg: string): void {
  console.log(color(CYAN, '·') + ' ' + msg);
}

export function success(msg: string): void {
  console.log(color(GREEN, '✓') + ' ' + msg);
}

export function warn(msg: string): void {
  console.warn(color(YELLOW, '!') + ' ' + msg);
}

export function error(msg: string): void {
  console.error(color(RED, '✗') + ' ' + msg);
}

export function dim(msg: string): void {
  console.log(color(DIM, msg));
}

export function table(rows: string[][]): void {
  if (rows.length === 0) return;
  const cols = rows[0].length;
  // Calculate display width (CJK chars = 2, ASCII = 1)
  const displayWidth = (s: string): number => {
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0) ?? 0;
      // CJK Unified Ideographs + CJK Symbols + Fullwidth forms
      if (
        (cp >= 0x4E00 && cp <= 0x9FFF) ||
        (cp >= 0x3000 && cp <= 0x303F) ||
        (cp >= 0xFF00 && cp <= 0xFFEF)
      ) {
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  };
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(...rows.map((r) => displayWidth(r[i] ?? ''))),
  );
  // Pad based on display width
  const padByWidth = (s: string, targetWidth: number): string => {
    const currentWidth = displayWidth(s);
    const padCount = targetWidth - currentWidth;
    return s + ' '.repeat(Math.max(0, padCount));
  };
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r]
      .map((cell, i) => padByWidth(cell ?? '', widths[i]))
      .join('  ');
    if (r === 0) console.log(color(DIM, line));
    else console.log(line);
  }
}
