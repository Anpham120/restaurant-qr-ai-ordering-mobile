/** Format digits-only input for VND fields (e.g. 100000 → 100.000). */
export function formatVndDigitsInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") {
    return "";
  }
  return Number(digits).toLocaleString("vi-VN");
}

export function parseVndDigitsInput(formatted: string): number {
  const digits = formatted.replace(/\D/g, "");
  if (digits === "") {
    return 0;
  }
  return Number.parseInt(digits, 10);
}
