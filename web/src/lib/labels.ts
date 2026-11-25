export function monogram(label: string): string {
  const value = label.trim();
  if (!value) return "?";
  if (/[\u3400-\u9fff]/.test(value[0])) return value.slice(0, 2);
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return value.slice(0, 2).toUpperCase();
}
