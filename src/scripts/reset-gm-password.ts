
import { getDb } from '../lib/db';
import { hashPassword } from '../lib/auth';

async function resetGMPassword() {
    const db = getDb();
    const hash = await hashPassword('gm');

    // Check if user exists
    const user = db.prepare("SELECT * FROM users WHERE username = 'gm'").get();
    if (!user) {
        console.log("User 'gm' not found. Creating...");
        db.prepare("INSERT INTO users (name, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)")
            .run('General Manager', 'gm', 'gm@fgstore.com', hash, 'general_manager');
    } else {
        console.log("Resetting password for 'gm'...");
        db.prepare("UPDATE users SET password_hash = ? WHERE username = 'gm'").run(hash);
    }
    console.log("Password reset success.");
}

resetGMPassword();
