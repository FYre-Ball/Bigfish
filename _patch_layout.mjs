import { readFileSync, writeFileSync } from 'node:fs';

const file = 'D:\\dsh\\profiles\\web\\node_modules\\dsh-better-sidebar\\lib\\client.js';
let s = readFileSync(file, 'utf8');

// Locate the embedded layout.css string span
const marker = 'const css = "/**\\n * Layout push';
const start = s.indexOf(marker);
if (start < 0) { console.error('marker not found'); process.exit(1); }
const tagIdx = s.indexOf('const tagId = "dsh-better-sidebar/layout.css"', start);
if (tagIdx < 0) { console.error('tagId not found'); process.exit(1); }
const endMarker = s.lastIndexOf('";', tagIdx);

const cssSpan = s.slice(start, endMarker);

// Count occurrences of the selector within the span (before patch)
const needle = '#root [data-slot=\\"conversation\\"] {';
const count = cssSpan.split(needle).length - 1;
console.log('occurrences of selector (in css span):', count);

// In the JS source, the CSS is a double-quoted string, so inner quotes are
// literally backslash + quote (`\"`). We must produce the same escaping in
// the replacement.
const before = '#root [data-slot=\\"conversation\\"] {';
const after  = '#root :has(> [data-slot=\\"conversation\\"]) {';

const patchedSpan = cssSpan.split(before).join(after);

if (!patchedSpan.includes(':has(> [data-slot')) {
  console.error('PATCH DID NOT APPLY');
  process.exit(1);
}

const out = s.slice(0, start) + patchedSpan + s.slice(endMarker);
writeFileSync(file, out, 'utf8');
console.log('WROTE', file, 'new length', out.length);

// Verify the querySelector (line 7829) was NOT touched
const qsOccurrences = out.split('#root [data-slot=\\"conversation\\"]').length - 1;
const qsOccurrences2 = out.split('#root :has(> [data-slot=\\"conversation\\"])').length - 1;
console.log('remaining "#root [data-slot=...]" occurrences in whole file:', qsOccurrences);
console.log('new ":has(> [data-slot=...]" occurrences in whole file:', qsOccurrences2);
