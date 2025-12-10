const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '2';
const CURLBUS_URL = `https://curlbus.app/${STOP_CODE}`;

// Serve static files
app.use(express.static(__dirname));

// API endpoint – פרסינג טקסט מ-curlbus
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();

        // שליפה מ-curlbus (טקסט פשוט)
        const response = await fetch(CURLBUS_URL);
        if (!response.ok) {
            throw new Error(`Curlbus returned ${response.status}`);
        }

        const text = await response.text();
        const lines = text.split('\n');
        const arrivals = [];

        let foundLine2 = false;
        for (const line of lines) {
            if (line.includes(` ${LINE_NUMBER} `) || line.includes(`│ ${LINE_NUMBER} │`) || line.includes(`│ ${LINE_NUMBER} `)) {
                foundLine2 = true;
                // חפש את עמודת הזמנים (האחרונה)
                const columns = line.split('│');
                if (columns.length > 3) {
                    const timesStr = columns[columns.length - 1].trim();
                    if (timesStr && timesStr !== '' && !timesStr.includes('Line')) {
                        const times = timesStr.split(',').map(t => t.trim().replace('m', '').replace('Now', '0'));
                        times.forEach(t => {
                            const minutes = parseInt(t);
                            if (!isNaN(minutes) && minutes >= -2 && minutes < 120) {
                                arrivals.push(Math.max(0, minutes));
                            }
                        });
                    }
                }
            }
        }

        arrivals.sort((a, b) => a - b);
        const topArrivals = [...new Set(arrivals)].slice(0, 3);

        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}:`, topArrivals);

        res.json({
            success: topArrivals.length > 0,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: now.toISOString(),
            source: 'curlbus_text'
        });

    } catch (error) {
        console.error('Curlbus error:', error.message);

        // Fallback ל-Stride אם צריך
        res.json({
            success: false,
            arrivals: [],
            timestamp: new Date().toISOString()
        });
    }
});

// Health check + דף ראשי
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', stopCode: STOP_CODE, lineNumber: LINE_NUMBER });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display server running on port ${PORT} with curlbus text parsing`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line ${LINE_NUMBER}`);
});
