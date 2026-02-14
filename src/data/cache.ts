import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CacheStore, CacheEntry } from '../types.js';
import { CACHE_TTL_MS } from '../config/defaults.js';

const CACHE_DIR = join(homedir(), '.fire-planner');
const CACHE_FILE = join(CACHE_DIR, 'cache.json');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadStore(): CacheStore {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function saveStore(store: CacheStore): void {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function cacheGet<T>(key: string): T | null {
  const store = loadStore();
  const entry = store[key] as CacheEntry<T> | undefined;
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > entry.ttl) {
    // Expired
    delete store[key];
    saveStore(store);
    return null;
  }

  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttl: number = CACHE_TTL_MS): void {
  const store = loadStore();
  store[key] = { data, cachedAt: Date.now(), ttl };
  saveStore(store);
}

export function cacheClear(): void {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, '{}', 'utf-8');
}
