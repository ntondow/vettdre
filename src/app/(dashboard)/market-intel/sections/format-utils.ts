export const fmtPrice = (n: number) =>
  n > 0 ? "$" + n.toLocaleString() : "—";

export const fmtDate = (d: string) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
};

export const fmtPhone = (ph: string) => {
  const digits = (ph || "").replace(/\D/g, "").slice(-10);
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1")
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return ph || "—";
};
