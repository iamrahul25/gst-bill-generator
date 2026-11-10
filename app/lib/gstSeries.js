// Initials are the first letter or digit of each word: "Shri Prabhu Ply" → SPP.
export function businessPrefix(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .map((word) => {
      const ch = word.match(/[A-Za-z0-9]/);
      return ch ? ch[0].toUpperCase() : "";
    })
    .join("");
}

// The invoice date is a calendar day chosen on the bill. Year and month come
// from that day, so the series is SPP/2026/11/0001 for 9 Nov 2026.
export function seriesPeriod(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month };
}
