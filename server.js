const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '2';  // מספר הקו כפי שהוא מופיע בשדה route_short_name

// Serve static files
app.use(express.static(__dirname));

// API endpoint לזמני הגעה - משתמש באנדפוינט עובד
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

        // קריאה ל-API של Open Bus Stride - siri_ride_stops (עובד!)
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/siri_ride_stops/list?` +
            `siri_stop__code=${STOP_CODE}&` +
            `order_by=order&` +
            `limit=20`  // יותר תוצאות כדי לתפוס קו 2
        );

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const arrivals = [];

        console.log(`Got ${data.length} results from siri_ride_stops`);

        for (const item of data) {
            // סינון לקו 2 לפי route_short_name
            if (item.siri_route__route_short_name !== LINE_NUMBER) {
                continue;
            }

            // חישוב זמן הגעה משוער (מתוכנן, כי אין ETA ישיר)
            let scheduledTime;
            if (item.gtfs_stop__arrival_time) {
                scheduledTime = item.gtfs_stop__arrival_time;
            } else if (item.scheduled_arrival_time) {
                scheduledTime = item.scheduled_arrival_time;
            } else {
                continue;
            }

            // פיצול HH:MM וחישוב דקות (עם התייחסות ליום הבא)
            const [hours, minutes] = scheduledTime.split(':').map(Number);
            let scheduledDate = new Date(now);
            scheduledDate.setHours(hours, minutes, 0, 0);

            // אם הזמן כבר עבר היום – העבר ליום הבא
            if (scheduledDate < now) {
                scheduledDate.setDate(scheduledDate.getDate() + 1);
            }

            const diffMinutes = Math.round((scheduledDate - now) / 60000);

            if (diffMinutes >= -2 && diffMinutes < 120) {
                arrivals.push(Math.max(0, diffMinutes));
            }
        }

        // מיון ולקיחת 3 ייחודיים
        arrivals.sort((a, b) => a - b);
        const topArrivals = [...new Set(arrivals)].slice(0, 3);

        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}:`, topArrivals);

        res.json({
            success: topArrivals.length > 0,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: now.toISOString(),
            source: 'siri_ride_stops'
        });

    } catch (error) {
        console.error('Error fetching arrivals:', error.message);

        // Fallback פשוט
        res.json({
            success: false,
            error: error.message,
            arrivals: [],
            timestamp: new Date().toISOString()
        });
    }
});

// Fallback GTFS אם צריך (אופציונלי)
async function getFallbackArrivals() {
    try {
        const now = new Date();
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/gtfs_stop_times/list?` +
            `stop__code=${STOP_CODE}&` +
            `trip__route__route_short_name=${LINE_NUMBER}&` +
            `limit=20`
        );

        if (!response.ok) return [];

        const data = await response.json();
        const arrivals = [];

        for (const item of data) {
            if (item.arrival_time) {
                const [hours, minutes] = item.arrival_time.split(':').map(Number);
                let scheduledDate = new Date(now);
                scheduledDate.setHours(hours, minutes, 0, 0);

                if (scheduledDate < now) {
                    scheduledDate.setDate(scheduledDate.getDate() + 1);
                }

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

// בדיקת בריאות
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', stopCode: STOP_CODE, lineNumber: LINE_NUMBER });
});

// דף ראשי
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// הפעלת השרת
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display server running on port ${PORT}`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line ${LINE_NUMBER}`);
});
