"use client";

// Client-only, dependency-free IndexedDB wrapper that persists a single private
// tournament entrant's IN-PROGRESS draft locally. The server is the real gate
// (register reserves the slot; partial/submit are the durable saves) — this store
// only keeps the player's local picks/arrangement so a refresh mid-draft doesn't
// lose work. It deliberately does NOT store the board (that always comes from the
// server on register, keyed to the tournament id) so a cleared/empty store simply
// restarts the draft for the same reserved entry.
//
// Keying mirrors lib/dailyPending.ts: per (tournamentId, entryId, accountTag),
// where accountTag is a non-crypto hash of (normalized name, PIN) — a namespace,
// not a security boundary. The full identity is re-supplied on every read/write.
//
// Everything no-ops gracefully on SSR / when IndexedDB is unavailable.

import { normalizeName } from "./tournamentValidation";

const DB_NAME = "md820-private-draft";
const STORE = "drafts";
const DB_VERSION = 1;

// One persisted local pick — identifiers + the lineup slot it occupies. Mirrors
// SimPick but kept local (no receipts: private boards are server-validated by
// (team, decade) set-match, not signed rolls).
export interface DraftPick {
  entity_id: string;
  team: string;
  decade: number;
  slot: number;
}

// The draft progress blob for one entry. `step` is a coarse marker the resuming
// component uses to land on the right screen.
export interface PrivateDraftData {
  // The five starters placed so far (0..5), in slot order [G,FLEX,W,FLEX,B].
  picks: DraftPick[];
  // Chosen captain slot (0..4) or null if not yet picked.
  captainSlot: number | null;
  // Chosen sixth man (from the board's bench slot) or null.
  sixthPick: { entity_id: string; team: string; decade: number } | null;
  // Team name typed so far (empty until set).
  teamName: string;
  // Coarse step marker so a resume lands on the right screen.
  step: "draft" | "interstitial" | "finalize";
}

export interface DraftKeyParts {
  tournamentId: string;
  entryId: string;
  name: string;
  pin: string;
}

// cyrb53-style fast non-crypto hash — same shape as dailyPending.accountTag. Only
// a namespace; collisions are astronomically unlikely across the few accounts one
// browser holds, and the key already pins tournamentId + entryId besides.
function accountTag(name: string, pin: string): string {
  const str = `${normalizeName(name)}:${pin}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

/** The IndexedDB key for one entrant's draft. Stable across reloads. */
export function makeDraftKey(parts: DraftKeyParts): string {
  return `${parts.tournamentId}:${parts.entryId}:${accountTag(parts.name, parts.pin)}`;
}

// True only where IndexedDB is actually usable (never on the server).
function hasIDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

// Open (and lazily create) the object store. Resolves null if IDB is unavailable
// or the open fails — every caller treats null as "just skip persistence".
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hasIDB()) {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/** Save (overwrite) the draft progress for `key`. No-ops on SSR / IDB failure. */
export async function savePrivateDraft(
  key: string,
  data: PrivateDraftData,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Load the draft progress for `key`, or null if none / IDB unavailable. */
export async function loadPrivateDraft(
  key: string,
): Promise<PrivateDraftData | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<PrivateDraftData | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () =>
        resolve((req.result as PrivateDraftData | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return result;
}

/** Delete the draft progress for `key` (called once the entry is submitted). */
export async function clearPrivateDraft(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
