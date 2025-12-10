const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '2';
const CURLBUS_BASE = 'https://curlbus.app';  // hosted ציבורי!

// Serve static files
app.use(express.static(__dirname));

// API endpoint – שליפה מ-curlbus.app
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date().getTime() / 1000;  // timestamp בשניות

        // שליפה מתחנה 21831 (סנן לקו 2)
        const response = await fetch(`${CURLBUS_BASE}/${STOP_CODE}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Curlbus returned ${response.status}`);
        }

        const data = await response.json();
        const arrivals = [];

        // סנן לקו 2 וחשב דקות מ-ETA
        if (data.arrivals && Array.isArray(data.arrivals)) {
            data.arrivals
                .filter(item => item.route === LINE_NUMBER)
                .forEach(item => {
                    const etaTimestamp = item.estimated_arrival;  // timestamp בשניות
                    if (etaTimestamp) {
                        const diffMinutes = Math.round((etaTimestamp - now) / 60);  // חישוב דקות
                        if (diffMinutes >= -2 && diffMinutes < 120) {
                            arrivals.push(Math.max(0, diffMinutes));
                        }
                    }
                });
        }

        arrivals.sort((a, b) => a - b);
        const topArrivals = [...new Set(arrivals)].slice(0, 3);

        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}:`, topArrivals);

        res.json({
            success: topArrivals.length > 0,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: new Date().toISOString(),
            source: 'curlbus_public'
        });

    } catch (error) {
        console.error('Curlbus error:', error.message);

        // Fallback ל-Stride (הקוד הישן שלך – העתק את הלולאה מ-server.js הקודם)
        try {
            // ... (קוד Stride כאן – כמו בהודעה קודמת)
            res.json({ /* נתונים מ-Stride */ });
        } catch (fallbackError) {
            res.json({
                success: false,
                error: 'No data available',
                arrivals: [],
                timestamp: new Date().toISOString()
            });
        }
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
    console.log(`🚌 Bus Display server running on port ${PORT} with curlbus public API`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line ${LINE_NUMBER}`);
});
