
#!/bin/bash
echo "Creating Admin User inside Docker container..."

docker compose exec app node -e "
const Database = require('better-sqlite3');
const db = new Database('data/fg-store.db');
try {
  db.prepare(\"INSERT INTO users (username, email, password_hash, name, role) VALUES ('admin', 'admin@fgstore.com', '\$2b\$10\$W54X5OXCm03OLBT1xLDuw.2aYBA8n7OOUAX1.OOLUUQFTpdnd4zKtS', 'System Admin', 'admin')\").run();
  console.log('✅ Admin user created successfully');
} catch(e) { 
  if(e.message.includes('UNIQUE constraint failed')) {
      console.log('ℹ️  Admin user already exists');
  } else {
      console.error('❌ Error:', e.message); 
  }
}
"
echo "Done."
