import { useCallback, useEffect, useMemo, useState } from "react";
import type { Measure, Task } from "../../shared/task.ts";
import { mintTaskId, TaskSchema } from "../../shared/task.ts";
import type { Period } from "../../shared/period.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";

/** What the task form hands over; the store stamps id and times. */
export interface TaskDraft {
  game: string;
  title: string;
  period: Period;
  measure: Measure;
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
 * Incoming records are validated — a file is untrusted input — and one that
 * does not parse is skipped. Records already on the device are kept as they
 * are, readable or not.
 */
export function mergeTasks(current: StoredTasks, incoming: unknown): StoredTasks {
  if (typeof incoming !== "object" || incoming === null) return current;
  const next: StoredTasks = { ...current };
  for (const value of Object.values(incoming as Record<string, unknown>)) {
    const parsed = TaskSchema.safeParse(value);
    if (!parsed.success) continue;
    const id = parsed.data.id;
    if (next[id] === undefined || parsed.data.updatedAt > updatedAtOf(next[id])) {
      next[id] = parsed.data;
    }
  }
  return next;
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
      const existing = TaskSchema.safeParse(prev[id]);
      if (!existing.success) return prev;
      const next = TaskSchema.parse({
        ...existing.data,
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      return { ...prev, [id]: next };
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
