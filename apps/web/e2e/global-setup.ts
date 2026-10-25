import { rm } from "node:fs/promises";
import path from "node:path";
import Redis from "ioredis";

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, "../../..");
  await rm(path.join(repoRoot, ".tmp/e2e"), { recursive: true, force: true });

  const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379/15", {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    await redis.quit().catch(() => undefined);
  }
}
