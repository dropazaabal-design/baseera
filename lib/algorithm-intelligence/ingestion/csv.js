// A small RFC 4180 CSV reader (quoted fields, escaped quotes, newlines in
// quotes, a UTF-8 BOM, comma or semicolon or tab separators). Platform
// exports put Arabic captions with commas and line breaks inside quotes,
// which a naive split would break.

export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].map((s) => [s, firstLine.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head = [], ...body] = rows;
  const keys = head.map((k) => k.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// Column lookup by any of several header spellings (case and spacing
// insensitive), so exports from different tools map to the same field.
export function pickColumn(row, aliases) {
  const norm = (s) => String(s).toLowerCase().replace(/[\s_\-()]+/g, '');
  const keys = Object.keys(row);
  for (const a of aliases) {
    const k = keys.find((x) => norm(x) === norm(a));
    if (k !== undefined && row[k] !== '') return row[k];
  }
  return null;
}
