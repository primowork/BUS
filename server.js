const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();  // <-- זה החלק שהיה חסר לך!
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_REF = 547;  // קו 2 של אגד - line_ref האמיתי הוא 547

// Serve static files (כדי שה-index.html ייטען)
app.use(express.static(__dirname));

// API endpoint לזמני הגעה
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();

        // שימוש באנדפוינט המומלץ עם ETA אמיתי
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/route_timetable/list?` +
            `stop_code=${STOP_CODE}&` +
            `line_ref=${LINE_REF}&` +
            `limit=15`
        );

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const arrivals = [];

        console.log(`Got ${data.length} results from route_timetable`);

        for (const item of data) {
            let arrivalTime;

            // עדיפות ל-ETA אמיתי (זמן אמת)
            if (item.eta) {
                arrivalTime = new Date(item.eta);
            } else if (item.arrival_time) {
                // fallback לזמן מתוכנן
                const [h, m, s] = item.arrival_time.split(':').map(Number);
                arrivalTime = new Date();
                arrivalTime.setHours(h, m, s || 0, 0);
            } else {
                continue;
            }

            const diffMinutes = Math.round((arrivalTime - now) / 60000);

            if (diffMinutes >= -5 && diffMinutes < 120) {
                arrivals.push(Math.max(0, diffMinutes));
            }
        }

        arrivals.sort((a, b) => a - b);
        const topArrivals = [...new Set(arrivals)].slice(0, 3);

        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line 2:`, topArrivals);

        res.json({
            success: topArrivals.length > 0,
            stopCode: STOP_CODE,
            lineNumber: '2',
            arrivals: topArrivals,
            timestamp: now.toISOString(),
            source: 'route_timetable'
        });

    } catch (error) {
        console.error('Error fetching arrivals:', error.message);
        res.json({
            success: false,
            error: error.message,
            arrivals: [],
            timestamp: new Date().toISOString()
        });
    }
});

// בדיקת בריאות
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', stopCode: STOP_CODE, lineNumber: '2' });
});

// דף ראשי
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// הפעלת השרת
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display server running on port ${PORT}`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line 2 (line_ref ${LINE_REF})`);
});
