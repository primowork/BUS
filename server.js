app.get('/api/arrivals', async (req, res) => {
    try {
        const now = new Date();

        // אנדפוינט מומלץ לזמני הגעה משוערים
        const response = await fetch(
            `https://open-bus-stride-api.hasadna.org.il/route_timetable/list?` +
            `stop_code=${STOP_CODE}&` +
            `line_ref=547&` +  // קו 2 = 547
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

            // עדיפות ל-ETA אמיתי
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
        console.error('Error:', error.message);
        res.json({
            success: false,
            error: error.message,
            arrivals: [],
            timestamp: new Date().toISOString()
        });
    }
});
