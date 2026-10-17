import { withReaderLock } from "../../state/reader/lock.ts";
import { mergeReaderData } from "../../state/reader/import.ts";
import { useState } from "react";
import {
  backupTier,
  deleteManualBackup,
  MANUAL_BACKUP_LIMIT,
  readBackups,
  readManualBackups,
  saveManualBackup,
  type BackupSnapshot,
} from "../../state/reader/backups.ts";
import { prepareRestore, undoRestore } from "../../state/reader/restore.ts";
import {
  buildReaderExport,
  parseReaderExport,
} from "../../state/reader/export.ts";
import { readLegacy } from "../../state/reader/store.ts";
import { triggerDownload } from "../../state/export.ts";
import { formatInZone } from "../../state/displayTime.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
export function BackupPage({ state }: { state: ReaderState }) {
  const [backups] = useState(() => readBackups(localStorage));
  const [manual, setManual] = useState(() => readManualBackups(localStorage));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selected, setSelected] = useState<BackupSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const zone =
    typeof state.prefs.timezone === "string" ? state.prefs.timezone : null;
  const restore = async (payload: unknown) => {
    const result = await withReaderLock(() =>
      prepareRestore(localStorage, payload, new Date().toISOString()),
    ).catch(() => ({ ok: false as const, reason: "unavailable" }));
    if (result.ok) location.reload();
    else
      setMessage(
        `Restore could not be completed (${result.reason}). Your current data is still available; export a copy before trying again.`,
      );
  };
  const importProgress = async (file: File) => {
    try {
      const parsed = parseReaderExport(JSON.parse(await file.text()));
      if (!parsed) {
        setMessage("This is not a supported Event Clock export.");
        return;
      }
      const merged = mergeReaderData(state, parsed);
      setSelected({
        id: "progress-import",
        at: new Date().toISOString(),
        payload: buildReaderExport(
          merged,
          readLegacy(localStorage),
          new Date().toISOString(),
        ),
      });
      setMessage(
        "Progress will be merged. Your appearance and other local preferences will be kept.",
      );
    } catch {
      setMessage("This file could not be read as an Event Clock export.");
    }
  };
  const preview = selected ? parseReaderExport(selected.payload) : null;
  const now = Date.now();
  const summary = (payload: Record<string, unknown>) => {
    const r = parseReaderExport(payload);
    if (!r) return "Unreadable backup";
    // The games that snapshot was tracking: an account exists for every game.
    const hidden = Array.isArray(r.prefs.hiddenGames)
      ? (r.prefs.hiddenGames as unknown[])
      : [];
    const accounts = Object.values(r.accounts).filter(
      (a) =>
        !a.retiredAt &&
        !hidden.includes(a.game) &&
        (a.intent.events || Object.values(a.routines).some((p) => p.followed)),
    );
    const games = new Set(accounts.map((a) => a.game)).size;
    const routines = accounts.reduce(
      (n, a) => n + Object.values(a.routines).filter((p) => p.followed).length,
      0,
    );
    const archived = Object.keys(r.archive).length;
    return `${games} game${games === 1 ? "" : "s"} · ${routines} routine${routines === 1 ? "" : "s"} · ${archived} archived event${archived === 1 ? "" : "s"}`;
  };
  const tiers = [
    { id: "daily", title: "Daily", span: "Last 7 days" },
    {
      id: "weekly",
      title: "Weekly",
      span: "Older snapshots, folded into 4 weeks",
    },
    {
      id: "monthly",
      title: "Monthly",
      span: "Older snapshots, folded into 6 months",
    },
  ] as const;
  const fileButton = (label: string, onFile: (file: File) => void) => (
    <label className="btn file-button">
      {label}
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
  const importAll = async (file: File) => {
    try {
      const payload: unknown = JSON.parse(await file.text());
      const reader = parseReaderExport(payload);
      if (!reader) {
        setMessage("This file is not a supported Event Clock backup.");
        return;
      }
      if ((payload as { scope?: unknown }).scope === "progress") {
        await importProgress(file);
        return;
      }
      setSelected({
        id: "import",
        at: new Date().toISOString(),
        payload: payload as Record<string, unknown>,
      });
    } catch {
      setMessage("This file could not be read as JSON.");
    }
  };
  return (
    <section className="backup-page">
      <h1>Backup</h1>
      <p className="muted-copy">
        Automatic snapshots keep a recent history of your data in this browser.
        The latest snapshot in each period is kept as older days fold into
        weeks, then months.
      </p>
      <dl className="backup-policy">
        <div>
          <dt>7 days</dt>
          <dd>Daily snapshots</dd>
        </div>
        <div>
          <dt>4 weeks</dt>
          <dd>Weekly snapshots</dd>
        </div>
        <div>
          <dt>6 months</dt>
          <dd>Monthly snapshots</dd>
        </div>
      </dl>
      <p className="source-note">
        Backups are created while you use the app. Days you don't open it have
        no new snapshot. These copies live in this browser, and clearing its
        storage removes them; export a file to keep a copy elsewhere.
      </p>
      <div className="backup-actions">
        <button
          type="button"
          className="btn solid"
          onClick={() => {
            // Its own list: automatic history keeps one snapshot a day, and a
            // copy made on purpose must not replace it or be replaced by it.
            const result = saveManualBackup(
              localStorage,
              state,
              new Date().toISOString(),
            );
            setMessage(
              result.ok
                ? "Backup saved to Your backups."
                : result.reason === "full"
                  ? "Your backups are full. Delete one to make room; this keeps space free for your progress."
                  : `Backup could not be saved (${result.reason}). Export a copy instead.`,
            );
            setManual(readManualBackups(localStorage));
          }}
        >
          Back up now
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            triggerDownload(
              buildReaderExport(
                state,
                readLegacy(localStorage),
                new Date().toISOString(),
              ),
              `event-clock-${new Date().toISOString().slice(0, 10)}.json`,
            )
          }
        >
          Export all data
        </button>
        {fileButton("Import all data", (file) => void importAll(file))}
      </div>
      <p className="backup-secondary">
        <span>Progress only, keeping this browser's settings:</span>
        <button
          type="button"
          className="btn link"
          onClick={() =>
            triggerDownload(
              {
                ...buildReaderExport(
                  { ...state, prefs: {} },
                  readLegacy(localStorage),
                  new Date().toISOString(),
                ),
                scope: "progress",
              },
              "event-clock-progress.json",
            )
          }
        >
          Export progress
        </button>
        <label className="btn link file-button">
          Import progress
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importProgress(file);
            }}
          />
        </label>
        <button
          type="button"
          className="btn link"
          onClick={async () => {
            const result = await withReaderLock(() =>
              undoRestore(localStorage),
            ).catch(() => ({ ok: false }));
            if (result.ok) location.reload();
            else setMessage("There is no recovery copy that can be restored.");
          }}
        >
          Undo last restore
        </button>
      </p>
      <p role="status" className="backup-message">
        {message}
      </p>
      {selected && preview && (
        <section className="backup-preview">
          <h2>Backup from {formatInZone(selected.at, true, zone)}</h2>
          <p>{summary(selected.payload)}</p>
          <p className="help">
            This replaces your current data. A recovery copy is saved first.
          </p>
          <div className="backup-actions">
            <button
              type="button"
              className="btn solid"
              onClick={() => restore(selected.payload)}
            >
              Restore this backup
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <section className="backup-tier">
        <div className="backup-tier-h">
          <h3>Your backups</h3>
          <span>
            {manual.length} of {MANUAL_BACKUP_LIMIT} · Kept until you delete
            them
          </span>
        </div>
        {manual.length === 0 ? (
          <p className="help">
            Back up now saves a copy here. Automatic history never replaces it.
          </p>
        ) : (
          manual.map((b) => (
            <div className="backup-row" key={b.id}>
              <div>
                <time dateTime={b.at}>{formatInZone(b.at, true, zone)}</time>
                <small>{summary(b.payload)}</small>
              </div>
              {confirming === b.id ? (
                <div className="backup-confirm">
                  <span>Delete this backup?</span>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => {
                      const result = deleteManualBackup(localStorage, b.id);
                      setConfirming(null);
                      if (selected?.id === b.id) setSelected(null);
                      setManual(readManualBackups(localStorage));
                      setMessage(
                        result.ok
                          ? "Backup deleted."
                          : `The backup could not be deleted (${result.reason}).`,
                      );
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <div className="backup-confirm">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setSelected(b)}
                  >
                    View backup
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`Delete backup from ${formatInZone(b.at, true, zone)}`}
                    onClick={() => setConfirming(b.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
      <h2 className="backup-history-h">Automatic history</h2>
      {backups.length === 0 ? (
        <p className="help">
          No saved history yet. A backup is created when you use the app.
        </p>
      ) : (
        tiers.map((tier) => {
          const rows = backups.filter((b) => backupTier(b.at, now) === tier.id);
          if (!rows.length) return null;
          return (
            <section className="backup-tier" key={tier.id}>
              <div className="backup-tier-h">
                <h3>{tier.title}</h3>
                <span>
                  {rows.length} snapshot{rows.length === 1 ? "" : "s"} ·{" "}
                  {tier.span}
                </span>
              </div>
              {rows.map((b) => (
                <div className="backup-row" key={b.id}>
                  <div>
                    <time dateTime={b.at}>
                      {formatInZone(b.at, true, zone)}
                    </time>
                    <small>{summary(b.payload)}</small>
                  </div>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setSelected(b)}
                  >
                    View backup
                  </button>
                </div>
              ))}
            </section>
          );
        })
      )}
    </section>
  );
}
