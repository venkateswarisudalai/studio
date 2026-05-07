import { openDB, type IDBPDatabase } from "idb";
import type { Session, VersionNode } from "./types";

const DB_NAME = "studio-canvas";
const DB_VERSION = 1;

interface StudioSchema {
  sessions: { key: string; value: Session };
  versions: { key: string; value: VersionNode; indexes: { sessionId: string } };
}

let _dbPromise: Promise<IDBPDatabase<unknown>> | null = null;

function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("versions")) {
          const v = db.createObjectStore("versions", { keyPath: "id" });
          v.createIndex("sessionId", "sessionId");
        }
      },
    });
  }
  return _dbPromise;
}

export async function putSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put("sessions", session);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return (await db.get("sessions", id)) as Session | undefined;
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = (await db.getAll("sessions")) as Session[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["sessions", "versions"], "readwrite");
  await tx.objectStore("sessions").delete(id);
  const idx = tx.objectStore("versions").index("sessionId");
  for await (const cur of idx.iterate(id)) await cur.delete();
  await tx.done;
}

export async function putVersion(
  sessionId: string,
  version: VersionNode
): Promise<void> {
  const db = await getDB();
  await db.put("versions", { ...version, sessionId } as VersionNode & {
    sessionId: string;
  });
}

export async function listVersions(sessionId: string): Promise<VersionNode[]> {
  const db = await getDB();
  const idx = db.transaction("versions").store.index("sessionId");
  const all = (await idx.getAll(sessionId)) as VersionNode[];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["sessions", "versions"], "readwrite");
  await tx.objectStore("sessions").clear();
  await tx.objectStore("versions").clear();
  await tx.done;
}
