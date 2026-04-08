# 📊 WhaTicket CSV Parser

Una herramienta web moderna para procesar reportes de conversaciones de WhaTicket y generar análisis detallados.

![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![License](https://img.shields.io/badge/license-ISC-blue)

## ✨ Características

- 🖱️ **Drag & Drop** - Carga archivos directamente
- 📊 **Análisis automático** - Procesa datos por panel y campaña
- 📈 **Estadísticas en tiempo real** - Visualización interactiva
- 💾 **Exporta JSON** - Descarga los resultados
- 🎨 **Interfaz moderna** - Diseño responsivo con Bootstrap
- ⚡ **Sin complicaciones** - Solo Node.js

## 🚀 Deployed on Vercel

Pruébalo en vivo: [https://whaticket-parser.vercel.app](https://whaticket-parser.vercel.app)

## 📋 Requisitos del CSV

Tu archivo CSV debe contener estas 4 columnas exactamente:

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| `assignedAt` | Fecha y hora | `2026-04-07 09:30:00` |
| `department` | Panel/Departamento | `Panel Royal` |
| `connection` | Campaña/Canal | `Reisenweaver Communications` |
| `conversationTags` | Tags (puede estar vacío) | `tag1;tag2` |

## 🏃 Instalación Local

### Paso 1: Clonar el repo
```bash
git clone https://github.com/TU_USUARIO/whaticket-parser.git
cd whaticket-parser
```

### Paso 2: Instalar dependencias
```bash
npm install
```

### Paso 3: Ejecutar en local
```bash
npm start
```

Accede a: `http://localhost:5000`

## 📤 Desplegar en Vercel

1. **Conecta tu repo de GitHub a Vercel:**
   - Ve a https://vercel.com/new
   - Selecciona "Import Git Repository"
   - Pega tu URL del repo
   - Vercel detectará automáticamente la configuración
   - Haz clic en "Deploy"

O usa Vercel CLI:
```bash
npm install -g vercel
vercel
```

## 📝 Estructura del Proyecto

```
.
├── server.js           # Servidor Express
├── index.html          # Interfaz web
├── templates/
│   └── index.html      # Alternativa (para despliegue)
├── package.json        # Dependencias
├── vercel.json         # Configuración Vercel
└── .gitignore          # Archivos a ignorar
```

## 🔧 Tecnologías

- **Express.js** - Servidor web
- **Multer** - Carga de archivos
- **csv-parser** - Parseo de CSV
- **CORS** - Control de acceso
- **Bootstrap 5** - Interfaz

## 📄 Licencia

ISC

## 👤 Autor

Creado para procesar reportes de WhaTicket
   o
   ```bash
   node server.js
   ```

## Uso

1. **El navegador se abrirá automáticamente** en `http://localhost:5000`

2. **Carga tu archivo CSV:**
   - Arrastra el archivo sobre el área de carga, o
   - Haz clic para seleccionar el archivo

3. **Revisa los resultados:**
   - **JSON Output**: El JSON formateado listo para copiar
   - **Paneles Detalle**: Visualización interactiva de datos
   - **Datos Raw**: JSON completo con estadísticas

## Estructura de datos esperada

El archivo CSV debe contener al menos estas columnas:

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| `assignedAt` | Fecha/hora de asignación | 2026-03-31 06:59:07 |
| `department` | Panel/Departamento | Panel Royal |
| `connection` | Campaña/Canal | Reisenweaver Communications |
| `conversationTags` | Tags de la conversación (para cargas) | Paso a principal |

## Formato de salida JSON

```json
[
  {
    "id": "0",
    "panel": "Panel Royal",
    "total_mensajes_hoy": 156,
    "cargas_hoy": 31,
    "porcentaje_carga": "19.9%",
    "campañas": {
      "Reisenweaver Communications": {
        "mensajes": 155,
        "cargas": 31
      },
      "Otra Campaña": {
        "mensajes": 1,
        "cargas": 0
      }
    },
    "detalle_por_origen": ["whaticket"]
  }
]
```

## Cálculos realizados

### Total mensajes
- Cuenta cada conversación con `assignedAt` del día actual

### Cargas
- Cuenta las conversaciones que tienen contenido en `conversationTags` (no vacío)

### Porcentaje de carga
- `(cargas_hoy / total_mensajes_hoy) * 100`

### Agrupación
- **Por panel**: Columna `department`
- **Por campaña**: Columna `connection`

## Estadísticas generadas

La herramienta también proporciona:

- ✓ Total de conversaciones en el archivo
- ✓ Total de paneles únicos
- ✓ Total de campañas únicas
- ✓ Total de cargas
- ✓ Top 3 paneles por volumen

## Troubleshooting

### Error: "Node.js no está instalado"
1. Descarga Node.js desde https://nodejs.org/ (versión LTS)
2. Instálalo y **reinicia tu computadora**
3. Abre `install.bat` nuevamente

### Error: "Columnas faltantes"
Asegúrate que tu CSV contenga estas columnas exactamente:
- `assignedAt`
- `department`
- `connection`
- `conversationTags`

### El archivo no se carga
- Verifica que sea un archivo CSV válido
- Comprueba que el tamaño no supere 16MB
- Intenta con otro navegador

### Puerto 5000 en uso
Si el puerto 5000 está en uso, modifica `server.js`:
```javascript
const port = 5001;  // Usa 5001 o cualquier otro puerto
```

## Ejemplos de uso

### Ejemplo 1: Procesar reporte diario
1. Exporta el CSV desde WhaTicket
2. Cárgalo en la herramienta
3. Copia el JSON resultante para integrar en otros sistemas

### Ejemplo 2: Comparar múltiples reportes
- Procesa varios archivos CSV secuencialmente
- Compara los porcentajes de carga entre paneles
- Identifica campañas de alto rendimiento

## Estructura del Proyecto

```
whaticket-parser/
├── server.js                 # Servidor Node.js
├── index.html                # Frontend
├── package.json              # Dependencias
├── install.bat               # Script de instalación
├── start.bat                 # Script para iniciar servidor
└── README.md                 # Este archivo
```

## Dependencias

- **express**: Framework web minimalista
- **multer**: Manejo de carga de archivos
- **csv-parser**: Procesamiento de archivos CSV
- **cors**: Soporte para CORS

## Autor

Creado para procesar reportes de WhaTicket

## Licencia

Uso libre

---

**Versión**: 2.0 (JavaScript/Node.js)  
**Última actualización**: 2026-04-07
