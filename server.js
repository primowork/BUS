const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ברירות מחדל
const DEFAULT_STOP = 21831;
const DEFAULT_LINE = '2';

// פונקציה לפרסינג הטקסט מ-curlbus
function parseCurlbusText(text, lineNumber) {
    const arrivals = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (line.includes('│')) {
            const columns = line.split('│').map(c => c.trim());
            
            for (let i = 0; i < columns.length; i++) {
                if (columns[i] === lineNumber || columns[i] === ` ${lineNumber} `) {
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
async function fetchFromCurlbus(stopCode, lineNumber) {
    const url = `https://curlbus.app/${stopCode}`;
    
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'curl/7.64.1',
            'Accept': 'text/plain'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Curlbus returned ${response.status}`);
    }

    const text = await response.text();
    console.log(`Curlbus for stop ${stopCode}, line ${lineNumber}:`);
    console.log(text.substring(0, 500));
    
    const arrivals = parseCurlbusText(text, lineNumber);
    
    if (arrivals.length > 0) {
        return { arrivals, source: 'curlbus' };
    }
    
    throw new Error('No arrivals found in curlbus response');
}

// ===== API ROUTES FIRST =====

// API endpoint ראשי
app.get('/api/arrivals', async (req, res) => {
    const now = new Date();
    
    const stopCode = parseInt(req.query.stop) || DEFAULT_STOP;
    const lineNumber = req.query.line || DEFAULT_LINE;
    
    console.log(`📍 Request for stop ${stopCode}, line ${lineNumber}`);
    
    try {
        const curlbusResult = await fetchFromCurlbus(stopCode, lineNumber);
        if (curlbusResult.arrivals.length > 0) {
            console.log(`✅ Curlbus success:`, curlbusResult.arrivals);
            return res.json({
                success: true,
                stopCode: stopCode,
                lineNumber: lineNumber,
                arrivals: curlbusResult.arrivals.slice(0, 3),
                timestamp: now.toISOString(),
                source: 'curlbus'
            });
        }
    } catch (e) {
        console.log('❌ Curlbus failed:', e.message);
    }
    
    res.json({
        success: false,
        stopCode: stopCode,
        lineNumber: lineNumber,
        arrivals: [],
        timestamp: now.toISOString(),
        source: 'none',
        error: 'Could not fetch data'
    });
});

// Debug endpoint
app.get('/api/debug/curlbus/:stop', async (req, res) => {
    try {
        const stopCode = req.params.stop;
        const response = await fetch(`https://curlbus.app/${stopCode}`, {
            headers: { 'User-Agent': 'curl/7.64.1' }
        });
        const text = await response.text();
        res.type('text/plain').send(text);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ===== STATIC FILES AFTER API =====
app.use(express.static(__dirname));

// Fallback to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚌 Bus Display running on port ${PORT}`);
    console.log(`📍 Supports dynamic stop/line via query params`);
    console.log(`   Example: /api/arrivals?stop=21831&line=2`);
});
