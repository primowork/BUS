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

// API endpoint למשיכת זמני הגעה - משתמש ב-curlbus.app
app.get('/api/arrivals', async (req, res) => {
    try {
        // קריאה ל-curlbus.app API עם header של JSON
        const response = await fetch(
            `https://curlbus.app/${STOP_CODE}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'BusDisplay/1.0'
                },
                timeout: 10000
            }
        );
        
        if (!response.ok) {
            throw new Error(`curlbus API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // מסנן רק את קו 2 ומחשב דקות להגעה
        const arrivals = [];
        
        // curlbus מחזיר את הנתונים בפורמט שונה
        // בדיקה של המבנה שמוחזר
        if (data.visits) {
            // visits הוא אובייקט עם מפתחות של קודי תחנות
            const stopVisits = data.visits[STOP_CODE] || data.visits[String(STOP_CODE)] || [];
            
            for (const visit of stopVisits) {
                // בודק אם זה הקו שאנחנו רוצים
                const lineName = visit.line_name || visit.route_short_name || visit.line_ref || '';
                
                if (lineName === LINE_NUMBER || lineName === `קו ${LINE_NUMBER}`) {
                    // curlbus מחזיר eta בשניות
                    let minutes = null;
                    
                    if (visit.eta !== undefined && visit.eta !== null) {
                        minutes = Math.round(visit.eta / 60);
                    } else if (visit.minutes !== undefined) {
                        minutes = visit.minutes;
                    } else if (visit.static_eta !== undefined) {
                        minutes = Math.round(visit.static_eta / 60);
                    }
                    
                    if (minutes !== null && minutes >= 0 && minutes < 120) {
                        arrivals.push(minutes);
                    }
                }
            }
        }
        
        // מיון ולקיחת 3 הראשונים
        arrivals.sort((a, b) => a - b);
        const topArrivals = arrivals.slice(0, 3);
        
        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}`);
        
        res.json({
            success: true,
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER,
            arrivals: topArrivals,
            timestamp: new Date().toISOString(),
            source: 'curlbus'
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

// Debug endpoint - לראות את כל הנתונים מ-curlbus
app.get('/api/debug', async (req, res) => {
    try {
        const response = await fetch(
            `https://curlbus.app/${STOP_CODE}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'BusDisplay/1.0'
                }
            }
        );
        
        const data = await response.json();
        res.json(data);
        
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
    console.log(`🔗 Using curlbus.app API for real-time data`);
});
