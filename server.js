const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;

// Serve static files from the current directory (for index.html)
app.use(express.static(__dirname));

// API endpoint for bus arrivals
app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();

        // Use the recommended endpoint without line_ref to avoid 500 error
        // This fetches all routes at the stop, and we'll filter for line 2 if needed
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/route_timetable/list?` +
            `stop_code=${STOP_CODE}&` +
            `limit=20`  // More results to ensure we catch line 2
        );

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const arrivals = [];

        console.log(`Got ${data.length} results from route_timetable`);

        for (const item of data) {
            // Filter only for line 2 (line_ref or route short name)
            if (item.route_short_name !== '2' && item.siri_route__line_ref !== 3232 && item.siri_route__line_ref !== 547) {
                continue;  // Skip non-line 2
            }

            let arrivalTime;

            // Priority to real ETA
            if (item.eta) {
                arrivalTime = new Date(item.eta);
            } else if (item.arrival_time) {
                // Fallback to scheduled time
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

        // Simple fallback response
        res.json({
            success: false,
            error: error.message,
            arrivals: [],
            timestamp: new Date().toISOString()
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', stopCode: STOP_CODE, lineNumber: '2' });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display server running on port ${PORT}`);
    console.log(`📍 Monitoring stop ${STOP_CODE} for line 2`);
});
