import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Journal = {
  entries: Array<{ idx: number; when: number; tag: string }>;
};

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');

describe('migration journal', () => {
  it('mantiene índices y timestamps estrictamente crecientes', async () => {
    const contents = await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8');
    const journal = JSON.parse(contents) as Journal;

    for (const [position, entry] of journal.entries.entries()) {
      expect(entry.idx).toBe(position);
      if (position > 0) {
        expect(entry.when).toBeGreaterThan(journal.entries[position - 1].when);
      }
    }
  });

  it('incluye exactamente un archivo SQL por entrada registrada', async () => {
    const contents = await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8');
    const journal = JSON.parse(contents) as Journal;
    const sqlFiles = (await readdir(migrationsDir))
      .filter(file => /^\d{4}_.+\.sql$/.test(file))
      .sort();
    const journalFiles = journal.entries.map(entry => `${entry.tag}.sql`).sort();

    expect(sqlFiles).toEqual(journalFiles);
  });
});
