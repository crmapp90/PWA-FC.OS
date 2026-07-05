import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000; // As required by the platform infrastructure

app.use(express.json());

// Lazy-loaded Gemini API Client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// API Endpoints
app.get('/api/health', (req, res) => {
  return res.json({ 
    status: 'ok', 
    service: 'FC.OS API Server', 
    timestamp: new Date().toISOString() 
  });
});

// Gemini AI analysis summary endpoint
app.post('/api/intelligence/summary', async (req: any, res: any) => {
  try {
    const { datasetStats, alertsCount, activeCollectorName } = req.body;
    
    // Safety check: Avoid crash if API key is not present
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'GEMINI_API_KEY_MISSING',
        message: 'Kunci API Gemini tidak dikonfigurasi di server. Silakan tambahkan GEMINI_API_KEY di panel Settings > Secrets.' 
      });
    }

    const ai = getAiClient();
    const prompt = `Analisis situasi harian untuk Kolektor Lapangan bernama "${activeCollectorName || 'Kolektor'}".
Statistik antrean kerja hari ini:
- Total Nasabah: ${datasetStats?.customers || 0}
- Total Kunjungan: ${datasetStats?.visits || 0}
- Jumlah Pembayaran Hari Ini: ${datasetStats?.payments || 0}
- Peringatan Operasional Aktif: ${alertsCount || 0}

Berikan ringkasan ringkas strategi penagihan harian yang optimal, motivasi singkat untuk kolektor lapangan, dan 2 poin taktis penting untuk menangani nasabah berisiko tinggi. Tanggapan harus dalam Bahasa Indonesia yang formal, ringkas, dan profesional.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return res.json({
      success: true,
      summary: response.text,
    });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    return res.status(500).json({
      success: false,
      error: 'GEMINI_EXECUTION_ERROR',
      message: err.message || 'Gagal mengeksekusi analisis kecerdasan buatan.'
    });
  }
});

// Serve static files in production from dist
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
