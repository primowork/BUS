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
        // שימוש ב-Open Bus Stride API - siri_vehicle_locations לזמן אמת
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        
        // קריאה ל-API של Open Bus Stride - חיפוש נסיעות פעילות
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/siri_ride_stops/list?` + 
            `siri_stop__code=${STOP_CODE}&` +
            `siri_ride__siri_route__line_ref=${LINE_NUMBER}&` +
            `order_by=order&` +
            `limit=10`
        );
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        const arrivals = [];
        
        console.log(`Got ${data.length} results from API`);
        
        for (const item of data) {
            // חישוב זמן הגעה משוער
            if (item.gtfs_stop__arrival_time || item.scheduled_arrival_time) {
                const scheduledTime = item.gtfs_stop__arrival_time || item.scheduled_arrival_time;
                // המרה לדקות מעכשיו
                const [hours, minutes] = scheduledTime.split(':').map(Number);
                const scheduledDate = new Date();
                scheduledDate.setHours(hours, minutes, 0, 0);
                
                const diffMinutes = Math.round((scheduledDate - now) / 60000);
                
                if (diffMinutes >= -2 && diffMinutes < 120) {
                    arrivals.push(Math.max(0, diffMinutes));
                }
            }
        }
        
        // מיון ולקיחת 3 הראשונים
        arrivals.sort((a, b) => a - b);
        const topArrivals = [...new Set(arrivals)].slice(0, 3); // unique values
        
        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}:`, topArrivals);
        
        res.json({
            success: topArrivals.length > 0,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: now.toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching arrivals:', error.message);
        
        // Fallback - נסה את ה-GTFS timetable
        try {
            const fallbackArrivals = await getFallbackArrivals();
            res.json({
                success: fallbackArrivals.length > 0,
                stopCode: STOP_CODE,
                lineNumber: LINE_NUMBER,
                arrivals: fallbackArrivals,
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

// פונקציית fallback - שימוש בלוח זמנים סטטי
async function getFallbackArrivals() {
    try {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday
        
        // קריאה ל-GTFS route timetable
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/gtfs_stop_times/list?` +
            `stop__code=${STOP_CODE}&` +
            `trip__route__line_ref=${LINE_NUMBER}&` +
            `limit=20`
        );
        
        if (!response.ok) return [];
        
        const data = await response.json();
        const arrivals = [];
        
        for (const item of data) {
            if (item.arrival_time) {
                const [hours, minutes] = item.arrival_time.split(':').map(Number);
                const scheduledDate = new Date();
                scheduledDate.setHours(hours, minutes, 0, 0);
                
                const diffMinutes = Math.round((scheduledDate - now) / 60000);
                
                if (diffMinutes >= 0 && diffMinutes < 120) {
                    arrivals.push(diffMinutes);
                }
            }
        }
        
        arrivals.sort((a, b) => a - b);
        return [...new Set(arrivals)].slice(0, 3);
    } catch (e) {
        console.error('Fallback error:', e.message);
        return [];
    }
}

// Debug endpoint
app.get('/api/debug', async (req, res) => {
    try {
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/siri_ride_stops/list?` + 
            `siri_stop__code=${STOP_CODE}&` +
            `limit=5`
        );
        
        const data = await response.json();
        res.json({
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            results: data,
            count: data.length
        });
        
    } catch (error) {
        res.json({ error: error.message });
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
