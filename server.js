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
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`curlbus API returned ${response.status}`);
        }
        
        const data = await response.json();
        const arrivals = [];
        
        console.log('Raw curlbus response keys:', Object.keys(data));
        
        // curlbus יכול להחזיר את הנתונים בכמה מבנים שונים
        // ננסה למצוא את הנתונים
        
        let visits = [];
        
        // אפשרות 1: data.visits[stopCode]
        if (data.visits) {
            visits = data.visits[STOP_CODE] || data.visits[String(STOP_CODE)] || [];
        }
        
        // אפשרות 2: data ישירות הוא מערך
        if (Array.isArray(data)) {
            visits = data;
        }
        
        // אפשרות 3: data.arrivals
        if (data.arrivals) {
            visits = data.arrivals;
        }
        
        // אפשרות 4: data.stop והנתונים בתוכו
        if (data.stop && data.stop.visits) {
            visits = data.stop.visits;
        }
        
        console.log(`Found ${visits.length} total visits`);
        
        for (const visit of visits) {
            // בדיקת שם הקו - curlbus משתמש בשדות שונים
            const lineNum = String(visit.line_name || visit.route_short_name || visit.line || visit.route || '');
            
            console.log(`Checking line: "${lineNum}" vs "${LINE_NUMBER}"`);
            
            // בודק התאמה (קו 2 יכול להיות "2" או 2)
            if (lineNum === LINE_NUMBER || lineNum === `קו ${LINE_NUMBER}` || String(lineNum).trim() === LINE_NUMBER) {
                
                // חישוב דקות - curlbus יכול להחזיר בכמה פורמטים
                let minutes = null;
                
                // eta בשניות
                if (typeof visit.eta === 'number') {
                    minutes = Math.round(visit.eta / 60);
                }
                // eta כמחרוזת עם 'm' (כמו "10m")
                else if (typeof visit.eta === 'string') {
                    const match = visit.eta.match(/(\d+)/);
                    if (match) {
                        minutes = parseInt(match[1]);
                    }
                    if (visit.eta.toLowerCase() === 'now') {
                        minutes = 0;
                    }
                }
                // minutes ישירות
                else if (typeof visit.minutes === 'number') {
                    minutes = visit.minutes;
                }
                // static_eta
                else if (typeof visit.static_eta === 'number') {
                    minutes = Math.round(visit.static_eta / 60);
                }
                
                console.log(`Line ${lineNum}: ${minutes} minutes`);
                
                if (minutes !== null && minutes >= 0 && minutes < 120) {
                    arrivals.push(minutes);
                }
            }
        }
        
        // מיון ולקיחת 3 הראשונים
        arrivals.sort((a, b) => a - b);
        const topArrivals = arrivals.slice(0, 3);
        
        console.log(`📍 Stop ${STOP_CODE}: Found ${topArrivals.length} arrivals for line ${LINE_NUMBER}:`, topArrivals);
        
        res.json({
            success: topArrivals.length > 0,
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

// Debug endpoint - לראות את כל הנתונים הגולמיים מ-curlbus
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
        res.json({
            raw: data,
            keys: Object.keys(data),
            stopCode: STOP_CODE,
            lineNumber: LINE_NUMBER
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
    console.log(`🔗 Using curlbus.app API for real-time data`);
});
