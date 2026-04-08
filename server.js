const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const app = express();
const port = 5000;

// Middleware - ORDER MATTERS!
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware (BEFORE routes)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Configurar multer
const upload = multer({ storage: multer.memoryStorage() });

// API Routes MUST come BEFORE static files
// This ensures /process-csv is handled by our route, not by static file handler

/**
 * Procesa los datos del CSV - SOLO datos de HOY
 * Retorna también información de todas las fechas encontradas
 */
function processConversationData(rows) {
  // Obtener HOY en formato YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];
  const dataToday = {}; // Agrupar paneles de HOY
  const allDatesFound = new Set(); // Todas las fechas del CSV

  rows.forEach(row => {
    // Parsear fecha
    const createdAtStr = row.createdAt || '';
    const createdDate = new Date(createdAtStr);
    
    if (isNaN(createdDate.getTime())) {
      return; // Saltar filas con fecha inválida
    }

    // Extraer la fecha sin hora (YYYY-MM-DD)
    const dateKey = createdDate.toISOString().split('T')[0];
    allDatesFound.add(dateKey);
    
    // SOLO procesar datos de HOY
    if (dateKey !== today) {
      return;
    }
    
    const department = (row.department || 'SIN_PANEL').trim();
    const connection = (row.connection || 'SIN_CAMPAÑA').trim();
    const tags = (row.conversationTags || '').trim();

    // Inicializar panel para hoy si no existe
    if (!dataToday[department]) {
      dataToday[department] = {
        id: '',
        panel: department,
        total_mensajes_hoy: 0,
        cargas_hoy: 0,
        porcentaje_carga: '0.0%',
        campañas: {},
        detalle_por_origen: ['whaticket']
      };
    }

    // Incrementar mensajes
    dataToday[department].total_mensajes_hoy += 1;

    // Inicializar campaña si no existe
    if (!dataToday[department].campañas[connection]) {
      dataToday[department].campañas[connection] = {
        mensajes: 0,
        cargas: 0
      };
    }

    dataToday[department].campañas[connection].mensajes += 1;

    // Contar carga si tiene tags
    if (tags && tags !== '' && tags !== 'nan') {
      dataToday[department].cargas_hoy += 1;
      dataToday[department].campañas[connection].cargas += 1;
    }
  });

  // Convertir a array y calcular porcentajes
  const panelsToday = Object.values(dataToday).map((panel, index) => {
    const total = panel.total_mensajes_hoy;
    const cargas = panel.cargas_hoy;
    const porcentaje = total > 0 ? ((cargas / total) * 100).toFixed(1) : '0.0';
    
    return {
      id: '',
      panel: panel.panel,
      total_mensajes_hoy: total,
      cargas_hoy: cargas,
      porcentaje_carga: `${porcentaje}%`,
      campañas: panel.campañas,
      detalle_por_origen: panel.detalle_por_origen
    };
  });

  // Ordenar paneles por total_mensajes_hoy descendente
  panelsToday.sort((a, b) => b.total_mensajes_hoy - a.total_mensajes_hoy);

  // Asignar IDs secuenciales
  panelsToday.forEach((item, index) => {
    item.id = index.toString();
  });

  return {
    panels: panelsToday,
    allDatesFound: Array.from(allDatesFound).sort().reverse(),
    hasDataToday: panelsToday.length > 0,
    today: today
  };
}

/**
 * Genera estadísticas para HOY
 */
function generateStatistics(result, totalRows) {
  const panelsToday = result.panels;
  const totalCampañas = new Set();
  let totalCargas = 0;
  let totalMensajes = 0;

  panelsToday.forEach(panel => {
    totalMensajes += panel.total_mensajes_hoy;
    totalCargas += panel.cargas_hoy;
    Object.keys(panel.campañas).forEach(camp => totalCampañas.add(camp));
  });

  return {
    total_conversaciones: totalMensajes,
    total_paneles: panelsToday.length,
    total_campañas: totalCampañas.size,
    total_cargas: totalCargas,
    paneles_top_3: panelsToday.slice(0, 3).map(item => ({
      panel: item.panel,
      mensajes: item.total_mensajes_hoy,
      cargas: item.cargas_hoy
    })),
    fecha_actual: result.today
  };
}

/**
 * Ruta para procesar CSV
 */
app.post('/process-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const rows = [];
    const stream = Readable.from([req.file.buffer.toString('utf-8')]);
    let responsesSent = false;

    stream
      .pipe(csv())
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', () => {
        if (responsesSent) return;
        responsesSent = true;
        
        try {
          // Validar columnas requeridas
          if (rows.length === 0) {
            return res.status(400).json({ error: 'El archivo CSV está vacío' });
          }

          const requiredColumns = ['createdAt', 'connection', 'conversationTags', 'department'];
          const firstRow = rows[0];
          const actualColumns = Object.keys(firstRow);
          const missingColumns = requiredColumns.filter(col => !(col in firstRow));

          if (missingColumns.length > 0) {
            return res.status(400).json({ 
              error: `Columnas faltantes: ${missingColumns.join(', ')}. Columnas encontradas: ${actualColumns.join(', ')}`
            });
          }

          // Procesar datos - SOLO HOY
          const result = processConversationData(rows);
          const statistics = generateStatistics(result, rows.length);

          res.json({
            success: true,
            data: result.panels,
            allDatesFound: result.allDatesFound,
            hasDataToday: result.hasDataToday,
            today: result.today,
            statistics: statistics,
            total_rows: rows.length
          });
        } catch (error) {
          console.error('Error in CSV processing:', error);
          if (!responsesSent) {
            responsesSent = true;
            res.status(500).json({ error: `Error al procesar datos: ${error.message}` });
          }
        }
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        if (!responsesSent) {
          responsesSent = true;
          res.status(400).json({ error: `Error al leer CSV: ${error.message}` });
        }
      });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: `Error en la carga: ${error.message}` });
  }
});

/**
 * Ruta raíz
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Test POST endpoint
 */
app.post('/test', (req, res) => {
  res.json({ message: 'POST is working' });
});

/**
 * Static files handler - MUST be after API routes
 */
app.use(express.static(__dirname));

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

/**
 * Iniciar servidor
 */
app.listen(port, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   WhaTicket CSV Parser - Servidor iniciado             ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🚀 Servidor ejecutándose en: http://localhost:' + port);
  console.log('');
  console.log('Presiona CTRL+C para detener el servidor');
  console.log('');
});
