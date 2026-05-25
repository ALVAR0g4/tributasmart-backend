import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from './database.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'))
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const tipos = ['application/pdf', 'image/jpeg', 'image/png']
    if (tipos.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Solo se permiten PDF, JPG y PNG'))
  }
})

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
  const { nombre, email, password, cedula, telefono, tipo } = req.body
  const existe = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email)
  if (existe) return res.status(400).json({ error: 'El email ya esta registrado' })
  const hash = bcrypt.hashSync(password, 10)
  const result = db.prepare('INSERT INTO usuarios (nombre, email, password, cedula, telefono, tipo) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nombre, email, hash, cedula, telefono, tipo || 'empleado')
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
  res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, tipo: usuario.tipo } })
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

// Guardar diagnostico
app.post('/diagnostico/:userId', (req, res) => {
  const { ingresos, patrimonio, tarjeta, compras, consignaciones, inversiones } = req.body
  
  // Limites DIAN 2024
  const LIMITE_INGRESOS = 59294000
  const LIMITE_PATRIMONIO = 190985000
  const LIMITE_CONSUMOS = 59294000
  const LIMITE_CONSIGNACIONES = 59294000

  const debeDeclarar = 
    ingresos > LIMITE_INGRESOS ||
    patrimonio > LIMITE_PATRIMONIO ||
    tarjeta > LIMITE_CONSUMOS ||
    consignaciones > LIMITE_CONSIGNACIONES

  // Actualizar ingresos en datos tributarios
  db.prepare('UPDATE datos_tributarios SET ingresos = ? WHERE usuario_id = ?')
    .run(ingresos, req.params.userId)

  res.json({ ok: true, debeDeclarar, mensaje: debeDeclarar ? 'Debes declarar renta 2024' : 'No estas obligado a declarar renta 2024' })
})
// LOGIN CONTADOR
app.post('/contador/login', (req, res) => {
  const { email, password } = req.body
  const contador = db.prepare('SELECT * FROM contadores WHERE email = ?').get(email)
  if (!contador) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const valido = bcrypt.compareSync(password, contador.password)
  if (!valido) return res.status(401).json({ error: 'Email o contrasena incorrectos' })
  const token = jwt.sign({ id: contador.id, email: contador.email, rol: 'contador' }, SECRET, { expiresIn: '7d' })
  res.json({ ok: true, token, contador: { id: contador.id, nombre: contador.nombre, email: contador.email, matricula: contador.matricula, rol: 'contador' } })
})

// CLIENTES DEL CONTADOR
app.get('/contador/:id/clientes', (req, res) => {
  const clientes = db.prepare(`
    SELECT u.id, u.nombre, u.email, u.cedula, u.telefono, dt.ingresos, dt.deducciones, dt.retenciones, dt.impuesto_estimado
    FROM relacion_contador_cliente rc
    JOIN usuarios u ON u.id = rc.usuario_id
    LEFT JOIN datos_tributarios dt ON dt.usuario_id = u.id
    WHERE rc.contador_id = ?
  `).all(req.params.id)
  res.json(clientes)
})
// GENERAR PDF
import PDFDocument from 'pdfkit'

app.get('/reporte/:userId/pdf', (req, res) => {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.userId)
  const datos = db.prepare('SELECT * FROM datos_tributarios WHERE usuario_id = ?').get(req.params.userId)

  if (!usuario || !datos) return res.status(404).json({ error: 'No encontrado' })

  const doc = new PDFDocument({ margin: 50 })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename=reporte_tributario_${usuario.nombre}.pdf`)

  doc.pipe(res)

  // Encabezado
  doc.fontSize(20).fillColor('#185FA5').text('TributaSmart', { align: 'center' })
  doc.fontSize(12).fillColor('#6b7280').text('Resumen Tributario - Año gravable 2024', { align: 'center' })
  doc.moveDown()
  doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke()
  doc.moveDown()

  // Datos del contribuyente
  doc.fontSize(13).fillColor('#111').text('Datos del contribuyente')
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#374151')
  doc.text(`Nombre: ${usuario.nombre}`)
  doc.text(`Cedula: ${usuario.cedula}`)
  doc.text(`Email: ${usuario.email}`)
  doc.text(`Tipo: ${usuario.tipo || 'Empleado'}`)
  doc.moveDown()

  // Resumen tributario
  doc.fontSize(13).fillColor('#111').text('Resumen tributario')
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#374151')
  doc.text(`Ingresos brutos:        $${Math.round(datos.ingresos).toLocaleString()}`)
  doc.text(`Deducciones:            $${Math.round(datos.deducciones).toLocaleString()}`)
  doc.text(`Retenciones a favor:    $${Math.round(datos.retenciones).toLocaleString()}`)
  doc.moveDown()

  // Calculo
  const rentaExenta = datos.ingresos * 0.25
  const rentaLiquida = datos.ingresos - rentaExenta - datos.deducciones
  const impuestoTabla = Math.max(0, rentaLiquida * 0.19)
  const impuestoNeto = Math.max(0, impuestoTabla - datos.retenciones)

  doc.fontSize(13).fillColor('#111').text('Calculo del impuesto')
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#374151')
  doc.text(`Renta exenta (25%):     $${Math.round(rentaExenta).toLocaleString()}`)
  doc.text(`Renta liquida:          $${Math.round(rentaLiquida).toLocaleString()}`)
  doc.text(`Impuesto segun tabla:   $${Math.round(impuestoTabla).toLocaleString()}`)
  doc.moveDown()

  doc.fontSize(13).fillColor('#185FA5').text(`Impuesto neto estimado: $${Math.round(impuestoNeto).toLocaleString()}`)
  doc.moveDown()

  // Pie
  doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke()
  doc.moveDown()
  doc.fontSize(9).fillColor('#9ca3af').text('Este reporte fue generado por TributaSmart. No reemplaza el concepto de un contador certificado.', { align: 'center' })
  doc.text(`Generado el ${new Date().toLocaleDateString('es-CO')}`, { align: 'center' })

  doc.end()
})
// Servir archivos subidos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// SUBIR DOCUMENTO
app.post('/documentos/:userId/subir', upload.single('archivo'), (req, res) => {
  const { nombre, tipo } = req.body
  const archivo = req.file
  if (!archivo) return res.status(400).json({ error: 'No se recibio archivo' })
  db.prepare('INSERT INTO documentos (usuario_id, nombre, tipo, estado) VALUES (?, ?, ?, ?)')
    .run(req.params.userId, nombre || archivo.originalname, tipo || 'otro', 'cargado')
  res.json({ ok: true, mensaje: 'Documento subido correctamente', archivo: archivo.filename })
})

// LISTAR DOCUMENTOS
app.get('/documentos/:userId', (req, res) => {
  const docs = db.prepare('SELECT * FROM documentos WHERE usuario_id = ?').all(req.params.userId)
  res.json(docs)
})

app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT)
})