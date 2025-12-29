import { getDb } from '../lib/db';
import bcrypt from 'bcryptjs';

async function resetAdmin() {
    try {
        const db = getDb();
        const password = await bcrypt.hash('admin', 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(password, 'admin');
        console.log('Admin password reset to: admin');
    } catch (error: any) {
        console.error('Reset failed:', error.message);
    }
}

resetAdmin();
