import Database from 'better-sqlite3';
import type { UserKeyRepository, StoredUserKey } from './repository';

export class SqliteUserKeyRepository implements UserKeyRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_keys (
        user_id TEXT PRIMARY KEY,
        encrypted_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  async save(userId: string, encryptedKey: string): Promise<void> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO user_keys (user_id, encrypted_key, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        encrypted_key = excluded.encrypted_key,
        updated_at = excluded.updated_at
    `);
    stmt.run(userId, encryptedKey, now, now);
  }

  async findByUserId(userId: string): Promise<StoredUserKey | null> {
    const stmt = this.db.prepare(
      'SELECT user_id, encrypted_key, created_at, updated_at FROM user_keys WHERE user_id = ?',
    );
    const row = stmt.get(userId) as
      | {
          user_id: string;
          encrypted_key: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) return null;

    return {
      userId: row.user_id,
      encryptedKey: row.encrypted_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async delete(userId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM user_keys WHERE user_id = ?');
    stmt.run(userId);
  }
}
