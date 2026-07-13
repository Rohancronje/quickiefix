/**
 * Build print-ready HTML versions of the user manuals.
 * Usage: node scripts/buildManuals.mjs
 * Output: "User Manuals/<name>.html" next to each .md — open in a browser and
 * print (Ctrl+P) for a clean, branded A4 document.
 */
import { marked } from 'marked';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = 'User Manuals';

const template = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { --navy:#0B1220; --amber:#FFB020; --muted:#5A6478; --line:#E2E7F1; }
  * { box-sizing: border-box; }
  body {
    font: 15px/1.65 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--navy); margin: 0; padding: 0; background: #fff;
  }
  .page { max-width: 800px; margin: 0 auto; padding: 48px 40px 80px; }
  .brandbar {
    background: var(--navy); color: #fff; padding: 28px 40px;
    display: flex; align-items: center; gap: 14px;
  }
  .brandbar img { height: 46px; }
  .brandbar .word { font-weight: 800; font-size: 22px; letter-spacing: .2px; }
  .brandbar .word b { color: var(--amber); }
  h1 { font-size: 30px; line-height: 1.25; margin: 26px 0 8px; }
  h2 { font-size: 21px; margin: 38px 0 10px; padding-top: 14px; border-top: 2px solid var(--line); }
  h3 { font-size: 16.5px; margin: 24px 0 8px; }
  p, li { color: #22314e; }
  strong { color: var(--navy); }
  a { color: #3D7BFF; text-decoration: none; }
  code { background: #F1F4FA; border-radius: 4px; padding: 1px 6px; font-size: 13px; }
  blockquote {
    margin: 14px 0; padding: 10px 16px; background: #FFF7E6;
    border-left: 4px solid var(--amber); border-radius: 6px;
  }
  blockquote p { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th { background: var(--navy); color: #fff; text-align: left; padding: 8px 12px; }
  /* The cover meta-table has an intentionally empty header row — hide it. */
  th:empty { display: none; }
  td { border: 1px solid var(--line); padding: 8px 12px; vertical-align: top; }
  tr:nth-child(even) td { background: #F7F9FD; }
  hr { border: none; border-top: 2px solid var(--line); margin: 32px 0; }
  /* Screenshots: phone shots as framed device-width figures; portal shots wide. */
  .page img {
    display: block; margin: 16px auto 4px; max-width: 230px; width: 100%;
    border: 1px solid var(--line); border-radius: 14px;
    box-shadow: 0 6px 24px rgba(11,18,32,.10);
  }
  .page img[src*="portal"] { max-width: 620px; border-radius: 8px; }
  .page img + em, .page p:has(img) + p > em:only-child {
    display: block; text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 16px;
  }
  li { margin: 3px 0; }
  .footer { margin-top: 56px; color: var(--muted); font-size: 13px; text-align: center; }
  @media print {
    .page { padding: 8mm 0 0; max-width: none; }
    .brandbar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    blockquote { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Cover page: title + meta table stand alone; contents starts page 2. */
    .page > table:first-of-type { break-after: page; }
    .page > table:first-of-type + hr { display: none; }
    /* Never leave a heading stranded at the bottom of a page. */
    h1, h2, h3 { break-after: avoid; break-inside: avoid; }
    p { orphans: 3; widows: 3; }
    li { break-inside: avoid; }
    /* Keep the TOC list in one block. */
    h2 + ol { break-inside: avoid; }
    /* Tables flow across pages (header row repeats); rows never split. */
    table { break-inside: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    /* Keep a screenshot and its caption together. */
    blockquote, .page img { break-inside: avoid; }
    p:has(> img) { break-inside: avoid; break-after: avoid; }
    p:has(> img) + p { break-before: avoid; }
    a { color: inherit; }
  }
  @page { margin: 14mm 12mm; }
</style>
</head>
<body>
  <div class="brandbar">
    <img src="https://quickiefix.store/email-logo.png" alt="QuickieFix">
    <div class="word">Quickie<b>Fix</b> · User Manual</div>
  </div>
  <div class="page">
    ${body}
    <div class="footer">QuickieFix · On-demand, verified tradies · quickiefix.store</div>
  </div>
</body>
</html>`;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  const md = readFileSync(join(DIR, file), 'utf8');
  const title = (md.match(/^# (.+)$/m)?.[1] ?? file).replace(/[#*]/g, '');
  const html = template(title, marked.parse(md));
  const out = join(DIR, file.replace(/\.md$/, '.html'));
  writeFileSync(out, html);
  console.log('built', out);
}
