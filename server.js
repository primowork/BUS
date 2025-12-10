const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '547';  // line_ref לקו 2 של דן (מתאים לתחנה 21831)

// Serve static files
app.use(express.static(__dirname));

// API endpoint לזמני הגעה - SIRI רשמי
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();

        // שלב 1: מצא את קוד התחנה המדויק (MonitoringRef) ב-SIRI
        const stopResponse = await fetch(
            'https://gtfs.mot.gov.il/rtis-siri/stopMonitoring?MonitoringRef=IL:1:1:21831&MaximumStopVisits=50&MaximumNumberOfCalls=10&Language=he'
        );

        if (!stopResponse.ok) {
            throw new Error(`Stop API returned ${stopResponse.status}`);
        }

        const stopData = await stopResponse.xml();  // SIRI מחזיר XML
        const parser = new DOMParser();  // צריך xml2js או libxmljs – נוסיף
        const parsedStop = parser.parseFromString(stopData, 'text/xml');

        // שלב 2: חפש הגעות לקו LINE_NUMBER
        const arrivalsResponse = await fetch(
            `https://gtfs.mot.gov.il/rtis-siri/estimatedTimetable?LineRef=${LINE_NUMBER}&MonitoringRef=IL:1:1:${STOP_CODE}&MaximumStopVisits=5&Language=he`
        );

        if (!arrivalsResponse.ok) {
            throw new Error(`Arrivals API returned ${arrivalsResponse.status}`);
        }

        const arrivalsData = await arrivalsResponse.xml();
        const parsedArrivals = parser.parseFromString(arrivalsData, 'text/xml');

        const arrivals = [];

        // פרסינג פשוט של XML (דוגמה – התאם לשדות)
        const calls = parsedArrivals.getElementsByTagName('Call');
        for (let call of calls) {
            const expectedTime = call.getElementsByTagName('ExpectedDepartureTime')[0]?.textContent;
            if (expectedTime) {
                const arrivalTime = new Date(expectedTime);
                const diffMinutes = Math.round((arrivalTime - now) / 60000);
                if (diffMinutes >= -5 && diffMinutes < 120) {
                    arrivals.push(Math.max(0, diffMinutes));
                }
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
            source: 'mot_siri'
        });

    } catch (error) {
        console.error('Error fetching arrivals:', error.message);

        // Fallback ל-GTFS סטטי (מתוכנן)
        try {
            const fallback = await getFallbackArrivals();
            res.json({
                success: fallback.length > 0,
                arrivals: fallback,
                timestamp: new Date().toISOString(),
                source: 'gtfs_fallback'
            });
        } catch (fallbackError) {
            res.json({
                success: false,
                error: error.message,
                arrivals: [],
                timestamp: new Date().toISOString()
            });
        }
    }
});

// Fallback GTFS
async function getFallbackArrivals() {
    try {
        const now = new Date();
        // GTFS רשמי - הורד קובץ stop_times.txt או השתמש ב-query אם זמין
        // לעת עתה, דוגמה סטטית – התאם לנתונים אמיתיים
        // בפועל, הורד GTFS מ- https://gtfs.mot.gov.il/gtfs_israel.zip והשתמש ב-csv-parser
        const arrivals = [15, 30, 45];  // דוגמה – החלף בפרסינג אמיתי
        return arrivals.slice(0, 3);
    } catch (e) {
        return [];
    }
}

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
    console.log(`📍 Monitoring stop ${STOP_CODE} for line 2 (MoT SIRI)`);
});
