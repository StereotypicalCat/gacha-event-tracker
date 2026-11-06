import { useState, type CSSProperties, type RefObject } from "react";
import { actionMeta } from "../../state/reader/actions.ts";
import {
  catchUpFor,
  defaultCatchUpAccount,
  keepKey,
  pickAccount,
  type CatchUpDay,
  type CatchUpItem,
} from "../../state/reader/catchUp.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import type { Account, ReaderState } from "../../state/reader/schema.ts";
import { serverSuffix } from "../../state/reader/servers.ts";
import type { ActionHandler } from "./GameSettings.tsx";

const VALUES_SHOWN = 4;

const dayName = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    ...options,
  });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function DayStrip({
  days,
  onToggle,
}: {
  days: readonly CatchUpDay[];
  onToggle: (day: CatchUpDay) => void;
}) {
  return (
    <div className="cu-strip">
      {days.map((day) => {
        const label = dayName(day.key, {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        return (
          <button
            type="button"
            className="cu-day"
            key={day.key}
            aria-label={label}
            aria-pressed={day.ticked}
            title={label}
            disabled={day.disabled}
            data-today={day.today || undefined}
            onClick={() => onToggle(day)}
          >
            <i>{dayName(day.key, { weekday: "short" }).slice(0, 2)}</i>
            <b>{Number(day.key.slice(8))}</b>
          </button>
        );
      })}
    </div>
  );
}

function ValueList({ values }: { values: NonNullable<CatchUpItem["values"]> }) {
  if (!values.length) return <p className="cu-none">Nothing recorded yet</p>;
  const line = (v: (typeof values)[number]) => (
    <li key={v.period}>
      <span>{v.label}</span>
      <b>{v.text}</b>
    </li>
  );
  const rest = values.slice(VALUES_SHOWN);
  return (
    <div className="cu-values">
      <ul>{values.slice(0, VALUES_SHOWN).map(line)}</ul>
      {rest.length > 0 && (
        <details className="cu-earlier">
          <summary>{plural(rest.length, "earlier value")}</summary>
          <ul>{rest.map(line)}</ul>
        </details>
      )}
    </div>
  );
}

function Row({
  item,
  onToggle,
}: {
  item: CatchUpItem;
  onToggle: (item: CatchUpItem, day: CatchUpDay) => void;
}) {
  const sub = [
    item.kind,
    item.behind > 0 ? `${item.behind} not ticked` : "",
  ].filter(Boolean);
  const toggle = (day: CatchUpDay) => onToggle(item, day);
  return (
    <div className="cu-row">
      <div className="cu-name">
        <strong>{item.title}</strong>
        {sub.length > 0 && <small>{sub.join(" · ")}</small>}
      </div>
      <div className="cu-log">
        {item.days && <DayStrip days={item.days} onToggle={toggle} />}
        {item.values && <ValueList values={item.values} />}
        {item.earlier.length > 0 && (
          <details className="cu-earlier">
            <summary>{plural(item.earlier.length, "earlier day")}</summary>
            <DayStrip days={item.earlier} onToggle={toggle} />
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Catch up on the Routines page (spec 2026-11-06): one account at a time, named
 * on a chip, so finding Endfield's dailies is one tap rather than seven
 * identical dropdowns. The choice is per-visit and holds through a tick, so the
 * list never moves under the reader as a count reaches zero.
 */
export function CatchUpSection({
  accounts,
  state,
  now,
  onAction,
  headingRef,
}: {
  accounts: readonly Account[];
  state: ReaderState;
  now: number;
  onAction: ActionHandler;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const meta = useGameMeta();
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const list = accounts.map((a) => catchUpFor(state, a, now, kept));
  const [selected, setSelected] = useState(() => defaultCatchUpAccount(list));
  const chosenId = pickAccount(selected, list);
  const account = accounts.find((a) => a.id === chosenId);
  const chosen = list.find((c) => c.accountId === chosenId);
  if (!account || !chosen) return null;
  const toggle = (item: CatchUpItem, day: CatchUpDay) => {
    if (day.ticked)
      setKept((old) =>
        new Set(old).add(keepKey(account.id, item.revisionId, item.id, day.key)),
      );
    void onAction({
      type: "day",
      accountId: account.id,
      revisionId: item.revisionId,
      itemId: item.id,
      day: day.key,
      checked: !day.ticked,
      ...actionMeta(),
    });
  };
  const olderCount = chosen.older.reduce((n, g) => n + g.items.length, 0);
  return (
    <section
      className="catch-up"
      style={{ "--hue": meta(account.game).hue } as CSSProperties}
    >
      <h2 ref={headingRef} tabIndex={-1}>
        Catch up
      </h2>
      <p className="meta">
        Last 14 days. Tick anything you did but didn't record.
      </p>
      <div className="focus-pills" role="group" aria-label="Game to catch up on">
        {accounts.map((a) => {
          const behind = list.find((c) => c.accountId === a.id)?.behind ?? 0;
          return (
            <button
              type="button"
              className="focus-pill"
              key={a.id}
              style={{ "--hue": meta(a.game).hue } as CSSProperties}
              aria-pressed={a.id === chosenId}
              onClick={() => setSelected(a.id)}
            >
              {`${meta(a.game).short}${serverSuffix(state, a.game, a.region)}`}
              {behind > 0 && <span className="n">{behind}</span>}
            </button>
          );
        })}
      </div>
      {chosen.items.length === 0 && (
        <p className="cu-none">
          Nothing followed for {meta(account.game).name} yet.
        </p>
      )}
      {chosen.items.map((item) => (
        <Row key={item.id} item={item} onToggle={toggle} />
      ))}
      {olderCount > 0 && (
        <details className="cu-older">
          <summary>Older records ({olderCount})</summary>
          {chosen.older.map((group) => (
            <section key={group.id}>
              <h3>{group.title}</h3>
              {group.note && <p className="meta">{group.note}</p>}
              {group.items.map((item) => (
                <Row key={item.id} item={item} onToggle={toggle} />
              ))}
            </section>
          ))}
        </details>
      )}
    </section>
  );
}
