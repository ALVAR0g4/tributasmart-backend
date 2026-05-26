import pg from 'pg'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Crear tablas
const init = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      cedula TEXT,
      telefono TEXT,
      tipo TEXT DEFAULT 'empleado',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS datos_tributarios (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      ingresos REAL DEFAULT 0,
      deducciones REAL DEFAULT 0,
      retenciones REAL DEFAULT 0,
      impuesto_estimado REAL DEFAULT 0,
      anno_gravable INTEGER DEFAULT 2024
    );

    CREATE TABLE IF NOT EXISTS documentos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contadores (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      matricula TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS relacion_contador_cliente (
      id SERIAL PRIMARY KEY,
      contador_id INTEGER NOT NULL REFERENCES contadores(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS notificaciones (
      id SERIAL PRIMARY KEY,
      contador_id INTEGER NOT NULL REFERENCES contadores(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      mensaje TEXT NOT NULL,
      leida BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE datos_tributarios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente';
  `)

  // Usuario de prueba
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', ['juan@ejemplo.com'])
  if (rows.length === 0) {
    const hash = bcrypt.hashSync('12345678', 10)
    const result = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, cedula, telefono, tipo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['Juan Carlos Perez', 'juan@ejemplo.com', hash, '1050123456', '+57 315 000 0000', 'empleado']
    )
    await pool.query(
      'INSERT INTO datos_tributarios (usuario_id, ingresos, deducciones, retenciones, impuesto_estimado) VALUES ($1, $2, $3, $4, $5)',
      [result.rows[0].id, 68500000, 12100000, 3400000, 4820000]
    )
  }

  // Contador de prueba
  const { rows: cont } = await pool.query('SELECT * FROM contadores WHERE email = $1', ['contador@ejemplo.com'])
  if (cont.length === 0) {
    const hash = bcrypt.hashSync('12345678', 10)
    const result = await pool.query(
      'INSERT INTO contadores (nombre, email, password, matricula) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Carlos Gomez CPC', 'contador@ejemplo.com', hash, '12345-T']
    )
    const { rows: u } = await pool.query('SELECT id FROM usuarios WHERE email = $1', ['juan@ejemplo.com'])
    await pool.query(
      'INSERT INTO relacion_contador_cliente (contador_id, usuario_id) VALUES ($1, $2)',
      [result.rows[0].id, u[0].id]
    )
  }

  console.log('Base de datos PostgreSQL lista')
}

init().catch(console.error)

export default pool