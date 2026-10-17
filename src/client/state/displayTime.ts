import { createContext } from "react";
export const DisplayTimeContext = createContext<string | null>(null);
export function formatInZone(
  instant: number | string,
  withTime: boolean,
  zone: string | null,
): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
    ...(zone ? { timeZone: zone } : {}),
  };
  try {
    return new Intl.DateTimeFormat("en-GB", options).format(new Date(instant));
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: undefined,
    }).format(new Date(instant));
  }
}

/** Resolve a local wall-clock reading; a gap during daylight saving is not an instant. */
export function instantInZone(
  date: string,
  time: string,
  zone: string,
): string | null {
  const wall = `${date}T${time.length === 5 ? time + ":00" : time}`,
    target = Date.parse(wall + "Z");
  if (
    !Number.isFinite(target) ||
    new Date(target).toISOString().slice(0, 10) !== date
  )
    return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const asWall = (ms: number) => {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
      );
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    };
    let candidate = target;
    for (let i = 0; i < 4; i++)
      candidate += target - Date.parse(asWall(candidate) + "Z");
    // Ambiguous fall-back readings choose the earliest matching instant, deterministically.
    for (let delta = -3 * 60; delta <= 3 * 60; delta++) {
      const ms = candidate + delta * 60000;
      if (asWall(ms) === wall) return new Date(ms).toISOString();
    }
    return null;
  } catch {
    return null;
  }
}
