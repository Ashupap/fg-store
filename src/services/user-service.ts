import type Database from 'better-sqlite3';
import { hashPassword } from '@/lib/auth';
import type { UserPublicRow } from '@/lib/db-types';
import { withTransaction } from '@/lib/transaction';

const GLOBAL_ROLES = ['admin', 'general_manager', 'marketing_manager'];

export interface CreateUserInput {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  assigned_store_ids?: number[];
}

export interface UpdateUserInput {
  name: string;
  username: string;
  email: string;
  password?: string;
  role: string;
  assigned_store_ids?: number[];
  is_active?: boolean;
}

export class UserService {
  constructor(private db: Database.Database) {}

  listAll(): (UserPublicRow & { assigned_store_ids: number[] })[] {
    const users = this.db.prepare(
      "SELECT id, name, username, email, role, is_active FROM users ORDER BY name ASC"
    ).all() as UserPublicRow[];

    const assignments = this.db.prepare(
      "SELECT user_id, store_id FROM user_stores"
    ).all() as { user_id: number; store_id: number }[];

    return users.map(u => ({
      ...u,
      assigned_store_ids: assignments
        .filter(a => a.user_id === u.id)
        .map(a => a.store_id),
    }));
  }

  findById(id: number) {
    return this.db.prepare(
      'SELECT id, name, username, email, role, is_active FROM users WHERE id = ?'
    ).get(id) as (UserPublicRow & { assigned_store_ids: number[] }) | undefined;
  }

  async create(input: CreateUserInput): Promise<number> {
    const { name, username, email, password, role, assigned_store_ids } = input;

    const existing = this.db.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).get(email, username);
    if (existing) {
      throw new Error('User with this username or email already exists');
    }

    const isGlobalRole = GLOBAL_ROLES.includes(role);
    if (!isGlobalRole && assigned_store_ids && assigned_store_ids.length > 1) {
      throw new Error('Localized operators and managers can only be assigned to one store.');
    }

    const passwordHash = await hashPassword(password);

    return withTransaction((db) => {
      const result = db.prepare(`
        INSERT INTO users (name, username, email, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(name, username, email, passwordHash, role);

      const userId = result.lastInsertRowid as number;

      if (assigned_store_ids && Array.isArray(assigned_store_ids) && assigned_store_ids.length > 0) {
        const insertStore = db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)');
        for (const storeId of assigned_store_ids) {
          insertStore.run(userId, storeId);
        }
      }

      return userId;
    });
  }

  async update(userId: number, input: UpdateUserInput): Promise<void> {
    const { name, username, email, password, role, assigned_store_ids, is_active } = input;

    const isGlobalRole = GLOBAL_ROLES.includes(role);
    if (!isGlobalRole && assigned_store_ids && assigned_store_ids.length > 1) {
      throw new Error('Localized operators and managers can only be assigned to one store.');
    }

    const existingInfo = this.db.prepare(
      'SELECT id, password_hash FROM users WHERE id = ?'
    ).get(userId) as { id: number; password_hash: string } | undefined;
    if (!existingInfo) {
      throw new Error('User not found');
    }

    const duplicate = this.db.prepare(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?'
    ).get(username, email, userId);
    if (duplicate) {
      throw new Error('User with this username or email already exists');
    }

    let newPasswordHash = existingInfo.password_hash;
    if (password && password.trim() !== '') {
      newPasswordHash = await hashPassword(password);
    }

    withTransaction((db) => {
      db.prepare(`
        UPDATE users 
        SET name = ?, username = ?, email = ?, password_hash = ?, role = ?, is_active = ?
        WHERE id = ?
      `).run(name, username, email, newPasswordHash, role, is_active ? 1 : 0, userId);

      if (assigned_store_ids && Array.isArray(assigned_store_ids)) {
        db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);
        const insertStore = db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)');
        for (const storeId of assigned_store_ids) {
          insertStore.run(userId, storeId);
        }
      }
    });
  }

  delete(userId: number): void {
    withTransaction((db) => {
      db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
  }
}
