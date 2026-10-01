const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

export function formatNumber(n, numerals = 'arab') {
  const s = String(n);
  return numerals === 'arab' ? s.replace(/[0-9]/g, (d) => ARABIC_INDIC[d]) : s;
}

export function counterLabel(index, total, style, numerals) {
  const current = formatNumber(index + 1, numerals);
  const count = formatNumber(total, numerals);
  return style === 'fraction' ? `${current}/${count}` : `الشريحة ${current} من ${count}`;
}
