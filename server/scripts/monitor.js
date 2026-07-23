import http from 'http';

const TARGET = process.argv[2] || 'http://localhost:5000';
const CHECK_INTERVAL = parseInt(process.argv[3]) || 30000; // 30 seconds
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK || ''; // Slack/Discord webhook URL

let failures = 0;
const MAX_FAILURES = 3;

function checkHealth() {
  const url = new URL('/api/health', TARGET);
  const start = Date.now();
  
  http.get(url, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const latency = Date.now() - start;
      const status = res.statusCode === 200 ? 'UP' : 'DEGRADED';
      
      try {
        const data = JSON.parse(body);
        const dbStatus = data.mongodb === 'connected' ? 'OK' : 'DOWN';
        const ts = new Date().toISOString();
        
        if (res.statusCode === 200 && data.status === 'ok') {
          failures = 0;
          process.stdout.write(`\r  ${ts} | ${status} | ${latency}ms | DB: ${dbStatus}                    `);
        } else {
          failures++;
          console.error(`\n  [ALERT] ${ts} | Health check failed: ${res.statusCode} | DB: ${dbStatus}`);
          if (failures >= MAX_FAILURES) sendAlert(`Health check failed ${failures}x in a row`);
        }
      } catch (e) {
        failures++;
        console.error(`\n  [ALERT] ${new Date().toISOString()} | Invalid health response`);
      }
    });
  }).on('error', (err) => {
    failures++;
    console.error(`\n  [ALERT] ${new Date().toISOString()} | Server unreachable: ${err.message}`);
    if (failures >= MAX_FAILURES) sendAlert(`Server DOWN — ${err.message}`);
  });
}

function sendAlert(message) {
  if (!ALERT_WEBHOOK) return;
  const payload = JSON.stringify({ text: `🚨 KEYCODE Monitor: ${message}` });
  try {
    const url = new URL(ALERT_WEBHOOK);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    req.write(payload);
    req.end();
  } catch(e) { /* silent */ }
}

// Handle graceful shutdown
process.on('SIGINT', () => { console.log('\n  Monitor stopped.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n  Monitor stopped.'); process.exit(0); });

console.log(`\n  KEYCODE Monitor`);
console.log(`  Target: ${TARGET}`);
console.log(`  Interval: ${CHECK_INTERVAL / 1000}s`);
console.log(`  Alert webhook: ${ALERT_WEBHOOK || 'none (logging only)'}`);
console.log(`  Press Ctrl+C to stop\n`);

checkHealth();
setInterval(checkHealth, CHECK_INTERVAL);
