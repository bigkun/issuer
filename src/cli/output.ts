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
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(...rows.map((r) => (r[i] ?? '').length)),
  );
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r]
      .map((cell, i) => (cell ?? '').padEnd(widths[i]))
      .join('  ');
    if (r === 0) console.log(color(DIM, line));
    else console.log(line);
  }
}
