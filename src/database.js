import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

const db = new Database('tributasmart.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    cedula TEXT,
    telefono TEXT,
    tipo TEXT DEFAULT 'empleado',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS datos_tributarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    ingresos REAL DEFAULT 0,
    deducciones REAL DEFAULT 0,
    retenciones REAL DEFAULT 0,
    impuesto_estimado REAL DEFAULT 0,
    anno_gravable INTEGER DEFAULT 2024,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
  CREATE TABLE IF NOT EXISTS contadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  matricula TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS relacion_contador_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contador_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  FOREIGN KEY (contador_id) REFERENCES contadores(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

`)

const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get('juan@ejemplo.com')
if (!usuario) {
  const hash = bcrypt.hashSync('12345678', 10)
  const result = db.prepare('INSERT INTO usuarios (nombre, email, password, cedula, telefono) VALUES (?, ?, ?, ?, ?)')
    .run('Juan Carlos Perez', 'juan@ejemplo.com', hash, '1050123456', '+57 315 000 0000')
  db.prepare('INSERT INTO datos_tributarios (usuario_id, ingresos, deducciones, retenciones, impuesto_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(result.lastInsertRowid, 68500000, 12100000, 3400000, 4820000)
    
const contador = db.prepare('SELECT * FROM contadores WHERE email = ?').get('contador@ejemplo.com')
if (!contador) {
  const hash = bcrypt.hashSync('12345678', 10)
  const result = db.prepare('INSERT INTO contadores (nombre, email, password, matricula) VALUES (?, ?, ?, ?)')
    .run('Carlos Gomez CPC', 'contador@ejemplo.com', hash, '12345-T')
  db.prepare('INSERT INTO relacion_contador_cliente (contador_id, usuario_id) VALUES (?, ?)').run(result.lastInsertRowid, 1)
}
}

export default db