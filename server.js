const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '2';

// Serve static files from root directory
app.use(express.static(__dirname));

// API endpoint למשיכת זמני הגעה
app.get('/api/arrivals', async (req, res) => {
    try {
        // קריאה ל-SIRI API של משרד התחבורה דרך Open Bus Stride
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/siri_rides/list?siri_route__line_refs=${LINE_NUMBER}&siri_stops__stop_ids=${STOP_CODE}&limit=20&order_by=siri_ride__scheduled_start_time`
        );
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // מסנן ומחשב דקות להגעה
        const now = new Date();
        const arrivals = [];
        
        for (const ride of data) {
            if (ride.siri_ride__scheduled_start_time) {
                // מחשב זמן הגעה משוער
                const scheduled = new Date(ride.siri_ride__scheduled_start_time);
                const diffMinutes = Math.round((scheduled - now) / 60000);
                
                if (diffMinutes >= 0 && diffMinutes < 120) {
                    arrivals.push(diffMinutes);
                }
            }
        }
        
        // מיון ולקיחת 3 הראשונים
        arrivals.sort((a, b) => a - b);
        const topArrivals = arrivals.slice(0, 3);
        
        res.json({
            success: true,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: now.toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching arrivals:', error);
        
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
    res.json({ status: 'ok', stopCode: STOP_CODE, lineNumber: LINE_NUMBER });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display server running on port ${PORT}`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line ${LINE_NUMBER}`);
});
