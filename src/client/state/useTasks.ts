import { useCallback, useEffect, useMemo, useState } from "react";
import type { Measure, Task } from "../../shared/task.ts";
import { mintTaskId, TaskId, TaskSchema } from "../../shared/task.ts";
import type { Period } from "../../shared/period.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";

/** What the task form hands over; the store stamps id and times. */
export interface TaskDraft {
  game: string;
  title: string;
  period: Period;
  measure: Measure;
  /** The built-in this copies, when it does (routines.ts). */
  from?: string | undefined;
}

/** The store as it sits on disk, every record kept whether or not this build reads it. */
export type StoredTasks = Record<string, unknown>;

/**
 * The tasks this build can read, ordered by game and then title.
 *
 * **Display only.** `useCustom` filters on load and its next write deletes what
 * did not parse; this store does not, because the likeliest unreadable task is
 * one a newer version wrote, and opening an older tab must not erase it.
 */
export function visibleTasks(raw: StoredTasks): Task[] {
  const out: Task[] = [];
  for (const value of Object.values(raw)) {
    const parsed = TaskSchema.safeParse(value);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.game.localeCompare(b.game) || a.title.localeCompare(b.title));
}

const updatedAtOf = (v: unknown): string => {
  const at = (v as { updatedAt?: unknown } | null)?.updatedAt;
  return typeof at === "string" ? at : "";
};

/**
 * Import: union by id, the later `updatedAt` winning, nothing removed.
 *
 * A record is let in on its identity alone — a `mytask:` id and a timestamp —
 * and stored **exactly as it came**, not as this build parses it. A backup is
 * where a newer version's task (or a field this build does not know) has to
 * survive a trip through an older one; parsing on the way in would strip the
 * field or drop the task, and re-importing could never bring either back.
 * Whether it can be *shown* is `visibleTasks`' question.
 */
export function mergeTasks(current: StoredTasks, incoming: unknown): StoredTasks {
  if (typeof incoming !== "object" || incoming === null) return current;
  const next: StoredTasks = { ...current };
  for (const value of Object.values(incoming as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const id = (value as { id?: unknown }).id;
    if (!TaskId.safeParse(id).success || updatedAtOf(value) === "") continue;
    const key = id as string;
    if (next[key] === undefined || updatedAtOf(value) > updatedAtOf(next[key])) {
      next[key] = value;
    }
  }
  return next;
}

/**
 * A stored task with the reader's edit applied, or null if it is not one this
 * build can edit. Built on the stored record, not on its parse, so a field a
 * newer version added rides through the edit untouched.
 */
export function editedTask(stored: unknown, draft: TaskDraft, at: string): unknown {
  if (!TaskSchema.safeParse(stored).success) return null;
  const next = { ...(stored as Record<string, unknown>), ...draft, updatedAt: at };
  return TaskSchema.safeParse(next).success ? next : null;
}

/**
 * The reader's weekly and monthly tasks (PRD F17).
 *
 * Deleting one removes the task record and nothing else: its ticks stay in the
 * day log and its numbers in the amounts store, like every log in this app.
 */
export function useTasks() {
  const [raw, setRaw] = useState<StoredTasks>(() => {
    const stored = readJson<unknown>(KEYS.tasks, {});
    return typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? (stored as StoredTasks)
      : {};
  });

  useEffect(() => {
    writeJson(KEYS.tasks, raw);
  }, [raw]);

  const tasks = useMemo(() => visibleTasks(raw), [raw]);

  const addTask = useCallback((draft: TaskDraft): string => {
    const now = new Date().toISOString();
    const task = TaskSchema.parse({ ...draft, id: mintTaskId(), at: now, updatedAt: now });
    setRaw((prev) => ({ ...prev, [task.id]: task }));
    return task.id;
  }, []);

  const editTask = useCallback((id: string, draft: TaskDraft) => {
    setRaw((prev) => {
      const next = editedTask(prev[id], draft, new Date().toISOString());
      return next === null ? prev : { ...prev, [id]: next };
    });
  }, []);

  const removeTask = useCallback((id: string) => {
    setRaw((prev) => {
      const { [id]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  const merge = useCallback((incoming: unknown) => {
    setRaw((prev) => mergeTasks(prev, incoming));
  }, []);

  return { raw, tasks, addTask, editTask, removeTask, merge };
}
