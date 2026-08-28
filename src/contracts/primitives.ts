import { Buffer } from "node:buffer";
import { z } from "zod";

export function boundedString(maxBytes: number, label: string) {
  return z
    .string()
    .min(1, `${label} must not be empty`)
    .refine((value) => Buffer.byteLength(value, "utf8") <= maxBytes, {
      message: `${label} is too large`,
    });
}

export function nullableOptional<T extends z.ZodType>(schema: T) {
  return schema.nullable().optional();
}

const RFC_3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

function isRfc3339Timestamp(value: string): boolean {
  const match = RFC_3339.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

export const rfc3339Schema = z
  .string()
  .refine(isRfc3339Timestamp, "Expected a valid RFC 3339 timestamp with an explicit offset");

export const calendarDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Expected a valid YYYY-MM-DD date");
