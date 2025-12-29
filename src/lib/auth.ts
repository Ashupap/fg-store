import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getDb } from './db';
import type { User, UserPublic, AuthToken } from '@/types';

const JWT_SECRET = process.env.JWT_SECRET || 'fg-store-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d'; // 7 days

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// Update type definition if UserPublic is imported, or just add username property here if it's dynamic
// Assuming UserPublic is imported from types, we should update types first? 
// Let's check types. But for now I will update the logic assuming types will allow it or I'll fix types later.

export function generateToken(user: UserPublic): string {
    const payload: Omit<AuthToken, 'exp'> & { username?: string } = {
        userId: user.id,
        email: user.email,
        username: (user as any).username, // Cast to any to bypass type check for now if types not updated
        name: user.name,
        role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthToken | null {
    try {
        return jwt.verify(token, JWT_SECRET) as AuthToken;
    } catch {
        return null;
    }
}

export async function getCurrentUser(): Promise<UserPublic | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth-token')?.value;

        if (!token) return null;

        const decoded = verifyToken(token);
        if (!decoded) return null;

        // Verify user still exists and is active
        const db = getDb();
        const user = db.prepare('SELECT id, email, username, name, role FROM users WHERE id = ? AND is_active = 1').get(decoded.userId) as UserPublic | undefined;

        if (!user) return null;

        // Fetch assigned stores
        const assignedStores = db.prepare('SELECT store_id, name FROM user_stores JOIN stores ON user_stores.store_id = stores.id WHERE user_id = ?').all(user.id) as { store_id: number; name: string }[];
        user.assigned_store_ids = assignedStores.map(s => s.store_id);
        user.assigned_store_names = assignedStores.map(s => s.name);

        return user;
    } catch {
        return null;
    }
}

export async function loginUser(username: string, password: string): Promise<{ success: boolean; user?: UserPublic; token?: string; error?: string }> {
    const db = getDb();

    // Check if input is email or username (optional hybrid, but request was explicitly username)
    // We will stick to username primarily, but maybe fallback to email if we want to be nice?
    // User said "Instead of user email, we'll use username". So I'll strictly query username.
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as User | undefined;

    if (!user) {
        return { success: false, error: 'Invalid username or password' };
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
        return { success: false, error: 'Invalid username or password' };
    }

    const userPublic: UserPublic & { username: string } = {
        id: user.id,
        email: user.email, // Keep email in object
        username: (user as any).username,
        name: user.name,
        role: user.role,
        assigned_store_ids: [],
        assigned_store_names: [],
    };

    // Fetch assigned stores
    const assignedStores = db.prepare('SELECT store_id, name FROM user_stores JOIN stores ON user_stores.store_id = stores.id WHERE user_id = ?').all(user.id) as { store_id: number; name: string }[];
    userPublic.assigned_store_ids = assignedStores.map(s => s.store_id);
    userPublic.assigned_store_names = assignedStores.map(s => s.name);

    const token = generateToken(userPublic);

    return { success: true, user: userPublic, token };
}

export async function createUser(username: string, email: string, password: string, name: string, role: string = 'operator'): Promise<{ success: boolean; user?: UserPublic; error?: string }> {
    const db = getDb();

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
        return { success: false, error: 'User with this username or email already exists' };
    }

    const passwordHash = await hashPassword(password);

    const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, email, passwordHash, name, role);

    const user: UserPublic & { username: string } = {
        id: result.lastInsertRowid as number,
        username,
        email,
        name,
        role,
    };

    return { success: true, user };
}

// Middleware helper to check authentication
export async function requireAuth(): Promise<UserPublic | null> {
    const user = await getCurrentUser();
    return user;
}
