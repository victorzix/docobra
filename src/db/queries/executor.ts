import type { db } from "@/db";

export type ExecutorDb = Pick<typeof db, "select" | "insert" | "update">;
