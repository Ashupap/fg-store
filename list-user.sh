
#!/bin/bash
echo "Checking users in database..."
docker compose exec app node -e "
const Database = require('better-sqlite3');
const db = new Database('data/fg-store.db');
try {
  const users = db.prepare('SELECT id, username, email, role, is_active FROM users').all();
  console.table(users);
} catch(e) {
  console.error('Error:', e.message);
}
"
