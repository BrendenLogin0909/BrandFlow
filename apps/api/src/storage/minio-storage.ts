/**
 * MinioStorageAdapter — StoragePort implementation against MinIO/S3.
 *
 * Client choice: the `minio` SDK (not @aws-sdk/client-s3). Reasoning:
 *   - MinIO is the only object store this project runs (docker-compose
 *     `minio` service); the official `minio` client is purpose-built for it
 *     (and is fully S3-compatible if we ever point STORAGE_ENDPOINT at real
 *     S3 — the wire protocol is the same).
 *   - Far smaller dependency surface than @aws-sdk/client-s3 (no credential
 *     provider chain, no service-per-package sprawl) for a port that only
 *     needs four operations (put/get/delete/signedUrl).
 *   - Simple constructor (endpoint/port/useSSL/accessKey/secretKey) matches
 *     this project's plain env-var config style (see storage/index.ts)
 *     rather than the SDK's config-resolution chain.
 */
import { Client as MinioClient } from 'minio';
import type { StoragePort } from '../ports/index.js';

export interface MinioStorageConfig {
  /** e.g. http://localhost:9000 */
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

function parseEndpoint(endpoint: string): { endPoint: string; port: number; useSSL: boolean } {
  const url = new URL(endpoint);
  const useSSL = url.protocol === 'https:';
  const port = url.port ? Number(url.port) : useSSL ? 443 : 80;
  return { endPoint: url.hostname, port, useSSL };
}

export class MinioStorageAdapter implements StoragePort {
  readonly bucket: string;
  private readonly client: MinioClient;

  constructor(config: MinioStorageConfig) {
    this.bucket = config.bucket;
    const { endPoint, port, useSSL } = parseEndpoint(config.endpoint);
    this.client = new MinioClient({
      endPoint,
      port,
      useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  /** Idempotent — safe to call on every boot. Throws if MinIO is unreachable (caller decides how to degrade). */
  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) await this.client.makeBucket(this.bucket);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, data, data.length, {
      'Content-Type': contentType,
    });
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async signedUrl(key: string, expiresSeconds: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiresSeconds);
  }
}
