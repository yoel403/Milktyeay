const orderTimeZone = "Asia/Jakarta";

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function getJakartaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: orderTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getMinimumOrderDate(now = new Date()) {
  const minimumDate = parseCalendarDate(getJakartaDate(now));
  if (!minimumDate) throw new Error("Unable to determine the minimum order date.");

  minimumDate.setUTCDate(minimumDate.getUTCDate() + 2);
  while (minimumDate.getUTCDay() === 0 || minimumDate.getUTCDay() === 6) {
    minimumDate.setUTCDate(minimumDate.getUTCDate() + 1);
  }

  return minimumDate.toISOString().slice(0, 10);
}

export function isAllowedOrderDate(value: string, now = new Date()) {
  const date = parseCalendarDate(value);
  if (!date || value < getMinimumOrderDate(now)) return false;

  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}
