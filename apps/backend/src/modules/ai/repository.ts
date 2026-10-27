export interface StoredUserKey {
  userId: string;
  encryptedKey: string; // base64 payload from encryptUserKey
  createdAt: Date;
  updatedAt: Date;
}

export interface UserKeyRepository {
  save(userId: string, encryptedKey: string): Promise<void>;
  findByUserId(userId: string): Promise<StoredUserKey | null>;
  delete(userId: string): Promise<void>;
}

export class InMemoryUserKeyRepository implements UserKeyRepository {
  private store = new Map<string, StoredUserKey>();

  async save(userId: string, encryptedKey: string): Promise<void> {
    const now = new Date();
    const existing = this.store.get(userId);
    this.store.set(userId, {
      userId,
      encryptedKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async findByUserId(userId: string): Promise<StoredUserKey | null> {
    return this.store.get(userId) ?? null;
  }

  async delete(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}