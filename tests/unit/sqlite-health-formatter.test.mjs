import { describe, expect, it } from "vitest";
import { formatSqliteHealth } from "../../src/db/sqlite.js";

describe("formatSqliteHealth", () => {
  it("preserves the complete diagnostic output shape", () => {
    expect(formatSqliteHealth({
      provider: "sqlite",
      databaseFile: "C:/data/longtail-forge.db",
      databaseFileWritable: true,
      foreignKeysEnabled: true,
      journalMode: "wal",
      busyTimeoutMs: 3210,
      synchronous: "normal",
      cacheSizeKib: 2048,
      tempStore: "memory",
      mmapSizeBytes: 134217728,
    })).toBe(
      "[sqlite-health] provider=sqlite databaseFile=C:/data/longtail-forge.db writable=yes foreign_keys=on journal_mode=wal busy_timeout_ms=3210 synchronous=normal cache_size_kib=2048 temp_store=memory mmap_size_bytes=134217728",
    );
  });

  it("reports unavailable health without touching the database", () => {
    expect(formatSqliteHealth(null)).toBe("[sqlite-health] unavailable");
  });
});
