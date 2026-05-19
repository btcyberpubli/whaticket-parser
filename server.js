const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const app = express();
const port = process.env.PORT || 5000;

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

// Helper: Obtener fecha en zona horaria de Argentina (UTC-3)
// Las fechas del CSV ya están en hora de Argentina, NO en UTC
function getArgentinaDate(dateObj = null) {
  let date;
  
  if (dateObj) {
    // Si se pasa una fecha, se asume que está en UTC
    // Se le restan 3 horas para convertir a Argentina
    const offsetMs = 3 * 60 * 60 * 1000;
    date = new Date(dateObj.getTime() - offsetMs);
  } else {
    // Si no se pasa fecha, usar ahora en Argentina
    // Primero obtenemos UTC, luego restamos 3 horas
    const utcNow = new Date();
    const offsetMs = 3 * 60 * 60 * 1000;
    date = new Date(utcNow.getTime() - offsetMs);
  }
  
  return date.toISOString().split('T')[0];
}

// Helper: Parsear fecha del CSV (formato: "2026-05-11 11:43:11")
// Las fechas del CSV YA están en zona horaria de Argentina, no en UTC
function parseCSVDate(dateStr) {
  if (!dateStr) return null;
  
  // Formato: "2026-05-11 11:43:11" - ya es hora de Argentina
  // Extraer solo la fecha YYYY-MM-DD
  const datePart = dateStr.split(' ')[0];
  
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null;
  }
  
  return datePart; // Retornar directamente como string YYYY-MM-DD
}

/**
 * Procesa los datos del CSV - SOLO datos de HOY
 * Retorna también información de todas las fechas encontradas
 */
function processConversationData(rows) {
  // Obtener HOY en formato YYYY-MM-DD (Argentina UTC-3)
  const today = getArgentinaDate();
  const dataToday = {}; // Agrupar paneles de HOY
  const allDatesFound = new Set(); // Todas las fechas del CSV
  
  let totalRowsWithToday = 0;
  let totalRowsProcessed = 0;

  rows.forEach((row, rowIndex) => {
    totalRowsProcessed++;
    
    // Parsear fecha con formato CSV: "2026-05-11 11:43:11"
    const createdAtStr = row.createdAt || '';
    const dateKey = parseCSVDate(createdAtStr); // Retorna "2026-05-11" directamente
    
    if (!dateKey) {
      return; // Saltar filas con fecha inválida
    }

    allDatesFound.add(dateKey);
    
    // SOLO procesar datos de HOY
    if (dateKey !== today) {
      return;
    }
    
    totalRowsWithToday++;
    
    const department = (row.department || 'SIN_PANEL').trim();
    const connection = (row.connection || 'SIN_CAMPAÑA').trim();
    const tags = (row.conversationTags || '').trim();
    
    const hasTag = tags && tags !== '' && tags !== 'nan';
    
    // Log de cada fila procesada (primeras 5 filas)
    if (totalRowsWithToday <= 5) {
      console.log(`   Row ${totalRowsWithToday}: fecha=${dateKey}, tags="${tags}" hasTag=${hasTag}`);
    }

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
    if (hasTag) {
      dataToday[department].cargas_hoy += 1;
      dataToday[department].campañas[connection].cargas += 1;
    }
  });
  
  // Log de debugging
  console.log(`\n🔍 Debug processConversationData:`);
  console.log(`   Total rows en CSV: ${totalRowsProcessed}`);
  console.log(`   Rows con fecha hoy (${today}): ${totalRowsWithToday}`);
  console.log(`   Paneles procesados: ${Object.keys(dataToday).length}`);

  // Convertir a array y calcular porcentajes
  const panelsToday = Object.values(dataToday).map((panel, index) => {
    const total = panel.total_mensajes_hoy;
    const cargas = panel.cargas_hoy;
    const porcentaje = total > 0 ? ((cargas / total) * 100).toFixed(1) : '0.0';
    
    console.log(`   [${panel.panel}] Total: ${total}, Cargas: ${cargas}, %: ${porcentaje}%`);
    
    
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

    // Eliminar BOM si existe
    let csvContent = req.file.buffer.toString('utf-8');
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }
    
    console.log(`📥 CSV recibido: ${req.file.originalname}, tamaño: ${req.file.buffer.length} bytes`);
    
    const rows = [];
    const stream = Readable.from([csvContent]);
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
          
          console.log(`\n✅ Respuesta final:`);
          console.log(`   Total filas CSV: ${rows.length}`);
          console.log(`   Paneles encontrados: ${result.panels.length}`);
          console.log(`   Estadísticas:`, {
            total_conversaciones: statistics.total_conversaciones,
            total_cargas: statistics.total_cargas,
            porcentaje_general: result.panels.length > 0 ? ((statistics.total_cargas / statistics.total_conversaciones) * 100).toFixed(1) + '%' : 'N/A'
          });

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
 * Debug: Ver fechas calculadas
 */
app.get('/debug-date', (req, res) => {
  const now = new Date();
  const arDate = getArgentinaDate();
  res.json({
    utc_now: now.toISOString(),
    argentina_date: arDate,
    offset_hours: -3,
    server_timezone: 'Vercel (UTC)'
  });
});

/**
 * Debug: Procesar test_data.json
 */
app.get('/debug-process', (req, res) => {
  try {
    const testDataPath = path.join(__dirname, 'test_data.json');
    if (!fs.existsSync(testDataPath)) {
      return res.status(404).json({ error: 'test_data.json not found' });
    }
    
    const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
    console.log('\n🔍 Debug endpoint: procesando test_data.json');
    console.log(`   Filas en test_data.json: ${testData.length}`);
    
    // Convertir a formato esperado
    const rows = testData.map(item => ({
      createdAt: item.createdAt || item.fecha || '',
      department: item.department || item.panel || '',
      connection: item.connection || item.campaña || '',
      conversationTags: item.conversationTags || item.tags || ''
    }));
    
    const result = processConversationData(rows);
    const statistics = generateStatistics(result, rows.length);
    
    res.json({
      success: true,
      message: 'Test data processed',
      data: result.panels,
      statistics: statistics,
      allDatesFound: result.allDatesFound,
      today: result.today
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
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
