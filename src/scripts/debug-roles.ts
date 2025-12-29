
import { getDb } from '../lib/db';

const db = getDb();
const users = db.prepare('SELECT id, username, role FROM users').all();
console.log(JSON.stringify(users, null, 2));
