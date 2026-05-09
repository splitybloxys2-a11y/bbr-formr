const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'bbr_database.sqlite');
const db = new Database(dbPath);
const schema = db.prepare("PRAGMA table_info(inscricoes)").all();
console.log(JSON.stringify(schema, null, 2));
db.close();
