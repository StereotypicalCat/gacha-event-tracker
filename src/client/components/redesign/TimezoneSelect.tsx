import { useMemo } from "react";

/** "GMT+2" for a zone, now; daylight saving included. */
export function zoneOffset(zone: string, at = new Date()): string {
  try {
    return (
      new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires, Argentina". */
export function zoneName(zone: string): string {
  const parts = zone.split("/").map((p) => p.replace(/_/g, " "));
  if (parts.length === 1) return parts[0]!;
  const [, ...rest] = parts;
  return rest.reverse().join(", ");
}

const REGIONS = [
  "Europe",
  "America",
  "Asia",
  "Australia",
  "Pacific",
  "Africa",
  "Atlantic",
  "Indian",
  "Antarctica",
  "Arctic",
];

/** Every IANA zone, grouped by region and named by city, A–Z within each group. */
export function zoneGroups(zones: readonly string[]) {
  const groups = new Map<string, { zone: string; name: string }[]>();
  for (const zone of zones) {
    const head = zone.split("/")[0]!;
    const group = REGIONS.includes(head) && zone.includes("/") ? head : "Other";
    const list = groups.get(group) ?? [];
    list.push({ zone, name: zoneName(zone) });
    groups.set(group, list);
  }
  return [...REGIONS, "Other"]
    .filter((g) => groups.has(g))
    .map((g) => ({
      group: g,
      zones: groups.get(g)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * The display timezone choice: Automatic first, then every zone grouped by
 * region with its offset. One native select, so the whole list opens at once
 * and typing a city's first letters jumps to it — no separate search box.
 */
export function TimezoneSelect({
  value,
  onChange,
  label = "Your timezone",
}: {
  /** null = Automatic (follow the device). */
  value: string | null;
  onChange: (zone: string | null) => void;
  label?: string;
}) {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const groups = useMemo(
    () => zoneGroups(Intl.supportedValuesOf("timeZone")),
    [],
  );
  return (
    <select
      aria-label={label}
      value={value ?? "automatic"}
      onChange={(e) =>
        onChange(e.target.value === "automatic" ? null : e.target.value)
      }
    >
      <option value="automatic">
        Automatic · {device} ({zoneOffset(device)})
      </option>
      {value !== null &&
        !groups.some((g) => g.zones.some((z) => z.zone === value)) && (
          // A saved zone this browser does not list still shows as chosen.
          <option value={value}>
            {value} · {zoneOffset(value)}
          </option>
        )}
      {groups.map(({ group, zones }) => (
        <optgroup key={group} label={group}>
          {zones.map(({ zone, name }) => (
            <option key={zone} value={zone}>
              {name} · {zoneOffset(zone)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
