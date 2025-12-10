const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');  // לפרסינג HTML
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '2';
const CURLBUS_URL = 'https://curlbus.app';

// Serve static files
app.use(express.static(__dirname));

// API endpoint – פרסינג HTML מ-curlbus
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();

        // שליפה מ-HTML של curlbus
        const response = await fetch(`${CURLBUS_URL}/${STOP_CODE}`);
        if (!response.ok) {
            throw new Error(`Curlbus returned ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const arrivals = [];

        // פרסינג טבלה – חפש שורות עם route=2
        $('tr').each((i, elem) => {
            const route = $(elem).find('.route').text().trim();  // התאם לסלקטורים אם צריך
            if (route === LINE_NUMBER) {
                const timesText = $(elem).find('.time').text().trim();  // טקסט כמו "2m, 18m"
                const times = timesText.split(',').map(t => t.trim().replace('m', ''));  // חלץ מספרים
                times.forEach(timeStr => {
                    const minutes = parseInt(timeStr);
                    if (!isNaN(minutes) && minutes >= -2 && minutes < 120) {
                        arrivals.push(Math.max(0, minutes));
                    }
                });
            }
        });

        arrivals.sort((a, b) => a - b);
        const topArrivals = [...new Set(arrivals)].slice(0, 3);

        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}:`, topArrivals);

        res.json({
            success: topArrivals.length > 0,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: now.toISOString(),
            source: 'curlbus_html'
        });

    } catch (error) {
        console.error('Curlbus error:', error.message);

        // Fallback ל-Stride (הקוד הישן – העתק את הלולאה מ-server.js קודם)
        try {
            // קוד Stride כאן (כמו בהודעה קודמת)
            // ...
            res.json({ /* arrivals מ-Stride */ });
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
    console.log(`🚌 Bus Display server running on port ${PORT} with curlbus HTML parsing`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line ${LINE_NUMBER}`);
});
