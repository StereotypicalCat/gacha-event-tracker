import type { CSSProperties } from "react";

export type MainView = "soon" | "timeline";

/**
 * The Round 6 B view cards (`viewCards()`): a drawn Checklist and a drawn
 * Timeline, used wherever the reader picks the view Event Clock opens on.
 */
export function ViewCards({
  value,
  onChange,
}: {
  value: MainView;
  onChange: (view: MainView) => void;
}) {
  return (
    <div className="viewpick" role="group" aria-label="Default view">
      <button
        type="button"
        className="vcard"
        aria-pressed={value === "soon"}
        onClick={() => onChange("soon")}
      >
        <div className="vprev list" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <b>Checklist</b>
        <small>A list, closest deadline first.</small>
      </button>
      <button
        type="button"
        className="vcard"
        aria-pressed={value === "timeline"}
        onClick={() => onChange("timeline")}
      >
        <div className="vprev tl" aria-hidden="true">
          {(
            [
              ["#4EA8DE", "4%", "52%", 6],
              ["#F2A03D", "30%", "44%", 24],
              ["#3DD6A0", "50%", "46%", 42],
            ] as const
          ).map(([g, left, width, top]) => (
            <i
              key={g}
              style={{ "--g": g, left, width, top } as CSSProperties}
            />
          ))}
          <em />
        </div>
        <b>Timeline</b>
        <small>Bars per game, today pinned.</small>
      </button>
    </div>
  );
}
