const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// הגדרות
const STOP_CODE = 21831;
const LINE_NUMBER = '2';
const CURLBUS_URL = `https://curlbus.app/${STOP_CODE}`;

// MOT SIRI API (חלופי)
const STRIDE_URL = 'https://open-bus-stride-api.hasadna.org.il/siri_vm_map/get';

// Serve static files
app.use(express.static(__dirname));

// פונקציה לפרסינג הטקסט מ-curlbus
function parseCurlbusText(text) {
    const arrivals = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (line.includes('│')) {
            const columns = line.split('│').map(c => c.trim());
            
            for (let i = 0; i < columns.length; i++) {
                if (columns[i] === LINE_NUMBER || columns[i] === `${LINE_NUMBER}`) {
                    // מחפשים את עמודת הזמנים
                    for (let j = columns.length - 1; j >= 0; j--) {
                        const timesCol = columns[j];
                        if (timesCol && timesCol.length > 0) {
                            const timeMatches = timesCol.match(/(\d+)m?|Now|↓/g);
                            if (timeMatches) {
                                timeMatches.forEach(t => {
                                    if (t === 'Now' || t === '↓') {
                                        arrivals.push(0);
                                    } else {
                                        const minutes = parseInt(t.replace('m', ''));
                                        if (!isNaN(minutes) && minutes >= 0 && minutes < 120) {
                                            arrivals.push(minutes);
                                        }
                                    }
                                });
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
    
    return arrivals;
}

// ניסיון לשלוף מ-curlbus
async function fetchFromCurlbus() {
    const response = await fetch(CURLBUS_URL, {
        headers: {
            'User-Agent': 'curl/7.64.1',
            'Accept': 'text/plain'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Curlbus returned ${response.status}`);
    }

    const text = await response.text();
    console.log('Curlbus raw (first 500):', text.substring(0, 500));
    
    const arrivals = parseCurlbusText(text);
    
    if (arrivals.length > 0) {
        return { arrivals, source: 'curlbus', raw: text.substring(0, 300) };
    }
    
    throw new Error('No arrivals found in curlbus response');
}

// שליפה מ-Stride API
async function fetchFromStride() {
    const response = await fetch(`${STRIDE_URL}?stop_code=${STOP_CODE}`, {
        headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
        throw new Error(`Stride returned ${response.status}`);
    }
    
    const data = await response.json();
    const arrivals = [];
    const now = Date.now();
    
    if (data && Array.isArray(data)) {
        data.forEach(bus => {
            if (bus.line_short_name === LINE_NUMBER || bus.line_ref === LINE_NUMBER) {
                if (bus.expected_arrival_time) {
                    const arrivalTime = new Date(bus.expected_arrival_time).getTime();
                    const minutesToArrival = Math.round((arrivalTime - now) / 60000);
                    if (minutesToArrival >= 0 && minutesToArrival < 120) {
                        arrivals.push(minutesToArrival);
                    }
                }
            }
        });
    }
    
    arrivals.sort((a, b) => a - b);
    return { arrivals: [...new Set(arrivals)].slice(0, 3), source: 'stride' };
}

// API endpoint ראשי
app.get('/api/arrivals', async (req, res) => {
    const now = new Date();
    
    // ניסיון 1: curlbus
    try {
        const curlbusResult = await fetchFromCurlbus();
        if (curlbusResult.arrivals.length > 0) {
            console.log(`📍 Curlbus success:`, curlbusResult.arrivals);
            return res.json({
                success: true,
                stopCode: STOP_CODE,
                lineNumber: LINE_NUMBER,
                arrivals: curlbusResult.arrivals.slice(0, 3),
                timestamp: now.toISOString(),
                source: 'curlbus'
            });
        }
    } catch (e) {
        console.log('Curlbus failed:', e.message);
    }
    
    // ניסיון 2: Stride API
    try {
        const strideResult = await fetchFromStride();
        if (strideResult.arrivals.length > 0) {
            console.log(`📍 Stride success:`, strideResult.arrivals);
            return res.json({
                success: true,
                stopCode: STOP_CODE,
                lineNumber: LINE_NUMBER,
                arrivals: strideResult.arrivals.slice(0, 3),
                timestamp: now.toISOString(),
                source: 'stride'
            });
        }
    } catch (e) {
        console.log('Stride failed:', e.message);
    }
    
    // אם שניהם נכשלו
    res.json({
        success: false,
        stopCode: STOP_CODE,
        lineNumber: LINE_NUMBER,
        arrivals: [],
        timestamp: now.toISOString(),
        source: 'none',
        error: 'Could not fetch data'
    });
});

// Debug endpoints
app.get('/api/debug/curlbus', async (req, res) => {
    try {
        const response = await fetch(CURLBUS_URL, {
            headers: { 'User-Agent': 'curl/7.64.1' }
        });
        const text = await response.text();
        res.type('text/plain').send(text);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', stopCode: STOP_CODE, lineNumber: LINE_NUMBER });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display running on port ${PORT}`);
    console.log(`📍 Stop ${STOP_CODE}, Line ${LINE_NUMBER}`);
    console.log(`🔗 ${CURLBUS_URL}`);
});
