/**
 * Minimal Express Server for Dual-Track Planner (Supabase Edition)
 * Serves static frontend + health check endpoint
 * All data operations handled directly by frontend via Supabase JS client
 */

import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: true,
    credentials: true
}));

// Serve static frontend
app.use(express.static(join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        version: '2.0.0-supabase'
    });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    // Don't intercept API routes (though we only have /api/health)
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Dual-Track Planner server running on http://localhost:${PORT}`);
    console.log(`Frontend served from: ${join(__dirname, '..', 'public')}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});