import { MsNoteDb, __setDbForTests } from '@/db/db';

let counter = 0;

/** テストごとに独立した IndexedDB を用意する */
export async function withFreshDb(): Promise<MsNoteDb> {
  counter += 1;
  const db = new MsNoteDb(`ms-note-test-${counter}-${Math.floor(Math.random() * 1e9)}`);
  __setDbForTests(db);
  await db.open();
  return db;
}

export async function closeDb(db: MsNoteDb): Promise<void> {
  db.close();
  __setDbForTests(null);
}
