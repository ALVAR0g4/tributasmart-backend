import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from './database.js'

const app = express()
const PORT = 3000
const SECRET = 'tributasmart2024'

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ mensaje: 'TributaSmart API funcionando correctamente' })
})

// REGISTRO
app.post('/auth/registro', (req, res) => {
  const { nombre, email, password, cedula, telefono } = req.body
  const existe = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email)
  if (existe) return res.status(400).json({ error: 'El email ya está registrado' })
  const hash = bcrypt.hashSync(password, 10)
  const result = db.prepare('INSERT INTO usuarios (nombre, email, password, cedula, telefono) VALUES (?, ?, ?, ?, ?)')
    .run(nombre, email, hash, cedula, telefono)
  db.prepare('INSERT INTO datos_tributarios (usuario_id) VALUES (?)').run(result.lastInsertRowid)
  res.json({ ok: true, mensaje: 'Usuario registrado correctamente' })
})

// LOGIN
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body
  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email)
  if (!usuario) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const valido = bcrypt.compareSync(password, usuario.password)
  if (!valido) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const token = jwt.sign({ id: usuario.id, email: usuario.email }, SECRET, { expiresIn: '7d' })
  res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } })
})

// DATOS TRIBUTARIOS
app.get('/tributario/:userId', (req, res) => {
  const datos = db.prepare('SELECT * FROM datos_tributarios WHERE usuario_id = ?').get(req.params.userId)
  if (!datos) return res.status(404).json({ error: 'No encontrado' })
  res.json(datos)
})

app.put('/tributario/:userId', (req, res) => {
  const { ingresos, deducciones, retenciones, impuesto_estimado } = req.body
  db.prepare('UPDATE datos_tributarios SET ingresos = ?, deducciones = ?, retenciones = ?, impuesto_estimado = ? WHERE usuario_id = ?')
    .run(ingresos, deducciones, retenciones, impuesto_estimado, req.params.userId)
  res.json({ ok: true, mensaje: 'Datos actualizados' })
})

// USUARIO
app.get('/usuario/:id', (req, res) => {
  const usuario = db.prepare('SELECT id, nombre, email, cedula, telefono, tipo FROM usuarios WHERE id = ?').get(req.params.id)
  if (!usuario) return res.status(404).json({ error: 'No encontrado' })
  res.json(usuario)
})

// DOCUMENTOS
app.get('/documentos/:userId', (req, res) => {
  const docs = db.prepare('SELECT * FROM documentos WHERE usuario_id = ?').all(req.params.userId)
  res.json(docs)
})

app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT)
})