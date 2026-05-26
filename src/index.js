import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import PDFDocument from 'pdfkit'
import db from './database.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
const SECRET = process.env.JWT_SECRET || 'tributasmart2024'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(cors())
app.use(express.json())

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

app.get('/', (req, res) => {
  res.json({ mensaje: 'TributaSmart API funcionando correctamente' })
})

// REGISTRO
app.post('/auth/registro', async (req, res) => {
  const { nombre, email, password, cedula, telefono, tipo, contador_id } = req.body
  const existe = await db.query('SELECT * FROM usuarios WHERE email = $1', [email])
  if (existe.rows.length > 0) return res.status(400).json({ error: 'El email ya esta registrado' })
  const hash = bcrypt.hashSync(password, 10)
  const result = await db.query(
    'INSERT INTO usuarios (nombre, email, password, cedula, telefono, tipo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [nombre, email, hash, cedula, telefono, tipo || 'empleado']
  )
  const userId = result.rows[0].id

  // Asignar contador seleccionado o el primero disponible
  const contId = contador_id || (await db.query('SELECT id FROM contadores LIMIT 1')).rows[0]?.id
  if (contId) {
    await db.query(
      'INSERT INTO relacion_contador_cliente (contador_id, usuario_id) VALUES ($1, $2)',
      [contId, userId]
    )
  }
  await db.query('INSERT INTO datos_tributarios (usuario_id) VALUES ($1)', [userId])
  res.json({ ok: true, mensaje: 'Usuario registrado correctamente' })
})

// LOGIN
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body
  const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email])
  const usuario = result.rows[0]
  if (!usuario) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const valido = bcrypt.compareSync(password, usuario.password)
  if (!valido) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const token = jwt.sign({ id: usuario.id, email: usuario.email }, SECRET, { expiresIn: '7d' })
  res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, tipo: usuario.tipo } })
})

// LOGIN CONTADOR
app.post('/contador/login', async (req, res) => {
  const { email, password } = req.body
  const result = await db.query('SELECT * FROM contadores WHERE email = $1', [email])
  const contador = result.rows[0]
  if (!contador) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const valido = bcrypt.compareSync(password, contador.password)
  if (!valido) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const token = jwt.sign({ id: contador.id, email: contador.email, rol: 'contador' }, SECRET, { expiresIn: '7d' })
  res.json({ ok: true, token, contador: { id: contador.id, nombre: contador.nombre, email: contador.email, matricula: contador.matricula, rol: 'contador' } })
})
// REGISTRO CONTADOR
app.post('/contador/registro', async (req, res) => {
  const { nombre, email, password, matricula } = req.body
  const existe = await db.query('SELECT * FROM contadores WHERE email = $1', [email])
  if (existe.rows.length > 0) return res.status(400).json({ error: 'El email ya esta registrado' })
  const hash = bcrypt.hashSync(password, 10)
  await db.query(
    'INSERT INTO contadores (nombre, email, password, matricula) VALUES ($1, $2, $3, $4)',
    [nombre, email, hash, matricula]
  )
  res.json({ ok: true, mensaje: 'Contador registrado correctamente' })
})

// DATOS TRIBUTARIOS
app.get('/tributario/:userId', async (req, res) => {
  const result = await db.query('SELECT * FROM datos_tributarios WHERE usuario_id = $1', [req.params.userId])
  if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
  res.json(result.rows[0])
})

app.put('/tributario/:userId', async (req, res) => {
  const { ingresos, deducciones, retenciones, impuesto_estimado } = req.body
  await db.query(
    'UPDATE datos_tributarios SET ingresos = $1, deducciones = $2, retenciones = $3, impuesto_estimado = $4 WHERE usuario_id = $5',
    [ingresos, deducciones, retenciones, impuesto_estimado, req.params.userId]
  )
  res.json({ ok: true, mensaje: 'Datos actualizados' })
})

// DIAGNOSTICO
app.post('/diagnostico/:userId', async (req, res) => {
  const { ingresos, patrimonio, tarjeta, consignaciones } = req.body
  const LIMITE_INGRESOS = 59294000
  const LIMITE_PATRIMONIO = 190985000
  const LIMITE_CONSUMOS = 59294000
  const LIMITE_CONSIGNACIONES = 59294000
  const debeDeclarar =
    ingresos > LIMITE_INGRESOS ||
    patrimonio > LIMITE_PATRIMONIO ||
    tarjeta > LIMITE_CONSUMOS ||
    consignaciones > LIMITE_CONSIGNACIONES
  await db.query('UPDATE datos_tributarios SET ingresos = $1 WHERE usuario_id = $2', [ingresos, req.params.userId])
  res.json({ ok: true, debeDeclarar, mensaje: debeDeclarar ? 'Debes declarar renta 2024' : 'No estas obligado a declarar renta 2024' })
})

// USUARIO
app.get('/usuario/:id', async (req, res) => {
  const result = await db.query('SELECT id, nombre, email, cedula, telefono, tipo FROM usuarios WHERE id = $1', [req.params.id])
  if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
  res.json(result.rows[0])
})

// DOCUMENTOS
app.get('/documentos/:userId', async (req, res) => {
  const result = await db.query('SELECT * FROM documentos WHERE usuario_id = $1', [req.params.userId])
  res.json(result.rows)
})

app.post('/documentos/:userId/subir', upload.single('archivo'), async (req, res) => {
  const { nombre, tipo } = req.body
  const archivo = req.file
  if (!archivo) return res.status(400).json({ error: 'No se recibio archivo' })
  await db.query(
    'INSERT INTO documentos (usuario_id, nombre, tipo, estado) VALUES ($1, $2, $3, $4)',
    [req.params.userId, nombre || archivo.originalname, tipo || 'otro', 'cargado']
  )
  res.json({ ok: true, mensaje: 'Documento subido correctamente' })
})

// CLIENTES DEL CONTADOR
app.get('/contador/:id/clientes', async (req, res) => {
  const result = await db.query(`
    SELECT u.id, u.nombre, u.email, u.cedula, u.telefono, 
           dt.ingresos, dt.deducciones, dt.retenciones, dt.impuesto_estimado, dt.estado
    FROM relacion_contador_cliente rc
    JOIN usuarios u ON u.id = rc.usuario_id
    LEFT JOIN datos_tributarios dt ON dt.usuario_id = u.id
    WHERE rc.contador_id = $1
  `, [req.params.id])
  res.json(result.rows)
})

// PDF
app.get('/reporte/:userId/pdf', async (req, res) => {
  const usuarioRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [req.params.userId])
  const datosRes = await db.query('SELECT * FROM datos_tributarios WHERE usuario_id = $1', [req.params.userId])
  const usuario = usuarioRes.rows[0]
  const datos = datosRes.rows[0]
  if (!usuario || !datos) return res.status(404).json({ error: 'No encontrado' })

  const doc = new PDFDocument({ margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename=reporte_${usuario.nombre}.pdf`)
  doc.pipe(res)

  doc.fontSize(20).fillColor('#185FA5').text('TributaSmart', { align: 'center' })
  doc.fontSize(12).fillColor('#6b7280').text('Resumen Tributario - Año gravable 2024', { align: 'center' })
  doc.moveDown()
  doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke()
  doc.moveDown()
  doc.fontSize(13).fillColor('#111').text('Datos del contribuyente')
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#374151')
  doc.text(`Nombre: ${usuario.nombre}`)
  doc.text(`Cedula: ${usuario.cedula}`)
  doc.text(`Email: ${usuario.email}`)
  doc.text(`Tipo: ${usuario.tipo || 'Empleado'}`)
  doc.moveDown()
  doc.fontSize(13).fillColor('#111').text('Resumen tributario')
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#374151')
  doc.text(`Ingresos brutos:      $${Math.round(datos.ingresos).toLocaleString()}`)
  doc.text(`Deducciones:          $${Math.round(datos.deducciones).toLocaleString()}`)
  doc.text(`Retenciones a favor:  $${Math.round(datos.retenciones).toLocaleString()}`)
  doc.moveDown()
  const rentaExenta = datos.ingresos * 0.25
  const rentaLiquida = datos.ingresos - rentaExenta - datos.deducciones
  const impuestoTabla = Math.max(0, rentaLiquida * 0.19)
  const impuestoNeto = Math.max(0, impuestoTabla - datos.retenciones)
  doc.fontSize(13).fillColor('#111').text('Calculo del impuesto')
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#374151')
  doc.text(`Renta exenta (25%):   $${Math.round(rentaExenta).toLocaleString()}`)
  doc.text(`Renta liquida:        $${Math.round(rentaLiquida).toLocaleString()}`)
  doc.text(`Impuesto segun tabla: $${Math.round(impuestoTabla).toLocaleString()}`)
  doc.moveDown()
  doc.fontSize(13).fillColor('#185FA5').text(`Impuesto neto estimado: $${Math.round(impuestoNeto).toLocaleString()}`)
  doc.moveDown()
  doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke()
  doc.moveDown()
  doc.fontSize(9).fillColor('#9ca3af').text('Este reporte fue generado por TributaSmart. No reemplaza el concepto de un contador certificado.', { align: 'center' })
  doc.text(`Generado el ${new Date().toLocaleDateString('es-CO')}`, { align: 'center' })
  doc.end()
})
// ACTUALIZAR USUARIO
app.put('/usuario/:id', async (req, res) => {
  const { nombre, cedula, telefono, email } = req.body
  await db.query(
    'UPDATE usuarios SET nombre = $1, cedula = $2, telefono = $3, email = $4 WHERE id = $5',
    [nombre, cedula, telefono, email, req.params.id]
  )
  res.json({ ok: true, mensaje: 'Usuario actualizado' })
})
// ENVIAR REPORTE AL CONTADOR
app.post('/reporte/:userId/enviar', async (req, res) => {
  const usuario = await db.query('SELECT * FROM usuarios WHERE id = $1', [req.params.userId])
  if (usuario.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
  
  // Buscar contador asignado
  const relacion = await db.query(
    'SELECT contador_id FROM relacion_contador_cliente WHERE usuario_id = $1',
    [req.params.userId]
  )
  if (relacion.rows.length === 0) return res.status(404).json({ error: 'No tienes contador asignado' })

  // Guardar notificacion
  await db.query(
    'INSERT INTO notificaciones (contador_id, usuario_id, mensaje, leida) VALUES ($1, $2, $3, $4)',
    [relacion.rows[0].contador_id, req.params.userId, `${usuario.rows[0].nombre} te envio su reporte para revision`, false]
  )
  res.json({ ok: true, mensaje: 'Reporte enviado al contador correctamente' })
})

// NOTIFICACIONES DEL CONTADOR
app.get('/contador/:id/notificaciones', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM notificaciones WHERE contador_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  )
  res.json(result.rows)
})

// MARCAR NOTIFICACION COMO LEIDA
app.put('/notificaciones/:id/leer', async (req, res) => {
  await db.query('UPDATE notificaciones SET leida = true WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})
// LISTAR CONTADORES DISPONIBLES
app.get('/contadores', async (req, res) => {
  const result = await db.query('SELECT id, nombre, email, matricula FROM contadores')
  res.json(result.rows)
})
// ACTUALIZAR ESTADO REPORTE
app.put('/tributario/:userId/estado', async (req, res) => {
  const { estado } = req.body
  await db.query(
    'UPDATE datos_tributarios SET estado = $1 WHERE usuario_id = $2',
    [estado, req.params.userId]
  )
  res.json({ ok: true, mensaje: 'Estado actualizado' })
})

app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT)
})