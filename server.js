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
 * Procesa los datos del CSV
 */
function processConversationData(rows) {
  const panelsData = {};
  const today = new Date().toDateString();

  rows.forEach(row => {
    // Parsear fecha
    const assignedAtStr = row.assignedAt || '';
    const assignedDate = new Date(assignedAtStr);
    
    if (isNaN(assignedDate.getTime())) {
      return; // Saltar filas con fecha inválida
    }

    const rowDate = assignedDate.toDateString();
    
    // Solo procesar conversaciones de hoy (o la fecha más reciente en los datos)
    const department = (row.department || 'SIN_PANEL').trim();
    const connection = (row.connection || 'SIN_CAMPAÑA').trim();
    const tags = (row.conversationTags || '').trim();

    // Inicializar panel
    if (!panelsData[department]) {
      panelsData[department] = {
        id: Object.keys(panelsData).length.toString(),
        panel: department,
        total_mensajes_hoy: 0,
        cargas_hoy: 0,
        porcentaje_carga: '0.0%',
        campañas: {},
        detalle_por_origen: ['whaticket']
      };
    }

    // Incrementar mensajes
    panelsData[department].total_mensajes_hoy += 1;

    // Inicializar campaña si no existe
    if (!panelsData[department].campañas[connection]) {
      panelsData[department].campañas[connection] = {
        mensajes: 0,
        cargas: 0
      };
    }

    panelsData[department].campañas[connection].mensajes += 1;

    // Contar carga si tiene tags
    if (tags && tags !== '' && tags !== 'nan') {
      panelsData[department].cargas_hoy += 1;
      panelsData[department].campañas[connection].cargas += 1;
    }
  });

  // Calcular porcentajes
  const result = Object.values(panelsData).map(panel => {
    const total = panel.total_mensajes_hoy;
    const cargas = panel.cargas_hoy;
    const porcentaje = total > 0 ? ((cargas / total) * 100).toFixed(1) : '0.0';
    
    return {
      ...panel,
      porcentaje_carga: `${porcentaje}%`
    };
  });

  // Ordenar por total_mensajes_hoy descendente
  result.sort((a, b) => b.total_mensajes_hoy - a.total_mensajes_hoy);

  // Recalcular IDs después de ordenar
  result.forEach((item, index) => {
    item.id = index.toString();
  });

  return result;
}

/**
 * Genera estadísticas
 */
function generateStatistics(result, totalRows) {
  const totalCampañas = new Set();
  let totalCargas = 0;

  result.forEach(panel => {
    totalCargas += panel.cargas_hoy;
    Object.keys(panel.campañas).forEach(camp => totalCampañas.add(camp));
  });

  return {
    total_conversaciones: totalRows,
    total_paneles: result.length,
    total_campañas: totalCampañas.size,
    total_cargas: totalCargas,
    paneles_top_3: result.slice(0, 3).map(item => ({
      panel: item.panel,
      mensajes: item.total_mensajes_hoy,
      cargas: item.cargas_hoy
    }))
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

          const requiredColumns = ['assignedAt', 'connection', 'conversationTags', 'department'];
          const firstRow = rows[0];
          const actualColumns = Object.keys(firstRow);
          const missingColumns = requiredColumns.filter(col => !(col in firstRow));

          if (missingColumns.length > 0) {
            return res.status(400).json({ 
              error: `Columnas faltantes: ${missingColumns.join(', ')}. Columnas encontradas: ${actualColumns.join(', ')}`
            });
          }

          // Procesar datos
          const data = processConversationData(rows);
          const statistics = generateStatistics(data, rows.length);

          res.json({
            success: true,
            data: data,
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
