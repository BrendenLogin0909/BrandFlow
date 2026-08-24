/**
 * StoragePort factory + readiness guard for MinIO/S3.
 *
 * The rest of the app must run fully without MinIO (dev machines that
 * haven't started the `minio` docker-compose service, CI without it, etc.).
 * So: boot-time bucket ensure is best-effort (logs one warning, never
 * throws — buildServer() must not fail to start), and every route that
 * touches storage wraps its call in `withStorage` so a downed/unreachable
 * MinIO degrades to a clean 503 instead of a 500 or an unhandled crash.
 * `withStorage` (not just the boot flag) is what actually gates each
 * request, so MinIO coming up late or flapping recovers automatically —
 * we don't get stuck on a stale "not ready" reading from boot.
 */
import { MinioStorageAdapter } from './minio-storage.js';
import type { StoragePort } from '../ports/index.js';

export interface StorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export function storageConfig(): StorageConfig {
  return {
    endpoint: process.env.STORAGE_ENDPOINT?.trim() || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY?.trim() || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY?.trim() || 'minioadmin',
    bucket: process.env.STORAGE_BUCKET?.trim() || 'brandflow-assets',
  };
}

let instance: MinioStorageAdapter | null = null;
let ready = false;
let lastError: string | null = null;

export function getStorage(): StoragePort {
  if (!instance) instance = new MinioStorageAdapter(storageConfig());
  return instance;
}

export function isStorageReady(): boolean {
  return ready;
}

export function storageLastError(): string | null {
  return lastError;
}

interface BootLogger {
  warn: (msg: string) => void;
  info?: (msg: string) => void;
}

/**
 * Best-effort boot check: ensure the bucket exists. NEVER throws — a
 * missing/unreachable MinIO must not prevent the API from starting.
 */
export async function initStorage(logger: BootLogger): Promise<void> {
  const cfg = storageConfig();
  try {
    await (getStorage() as MinioStorageAdapter).ensureBucket();
    ready = true;
    lastError = null;
    logger.info?.(`Object storage ready — bucket "${cfg.bucket}" at ${cfg.endpoint}`);
  } catch (err) {
    ready = false;
    lastError = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Object storage unavailable (${lastError}). Asset upload/content routes will return 503 until ` +
        `MinIO is reachable at ${cfg.endpoint}. Start it with: docker compose up -d minio`,
    );
  }
}

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Run a storage operation, converting a downed/unreachable MinIO into a typed failure instead of a throw. */
export async function withStorage<T>(op: () => Promise<T>): Promise<StorageResult<T>> {
  try {
    const value = await op();
    ready = true;
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ready = false;
    lastError = message;
    return { ok: false, error: message };
  }
}
