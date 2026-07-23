import http from 'http';

const TARGET = process.argv[2] || 'http://localhost:5000';
const CONCURRENCY = parseInt(process.argv[3]) || 10;
const DURATION = parseInt(process.argv[4]) || 30;

const endpoints = [
  { path: '/api/health', method: 'GET' },
  { path: '/', method: 'GET' },
  { path: '/pricing.html', method: 'GET' },
  { path: '/docs.html', method: 'GET' },
  { path: '/status.html', method: 'GET' },
  { path: '/api/services', method: 'GET' },
  { path: '/api/blog', method: 'GET' },
];

let completed = 0;
let errors = 0;
let totalLatency = 0;
let startTime = Date.now();

function randomEndpoint() {
  return endpoints[Math.floor(Math.random() * endpoints.length)];
}

function makeRequest() {
  if (Date.now() - startTime > DURATION * 1000) return;
  const ep = randomEndpoint();
  const url = new URL(ep.path, TARGET);
  const reqStart = Date.now();
  
  const req = http.request(url, { method: ep.method }, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const latency = Date.now() - reqStart;
      totalLatency += latency;
      completed++;
      if (res.statusCode >= 400) errors++;
      makeRequest();
    });
  });
  
  req.on('error', () => {
    errors++;
    completed++;
    makeRequest();
  });
  
  req.end();
}

console.log(`\n  Load Testing: ${TARGET}`);
console.log(`  Concurrency: ${CONCURRENCY}`);
console.log(`  Duration: ${DURATION}s`);
console.log(`  Endpoints: ${endpoints.length}\n`);

for (let i = 0; i < CONCURRENCY; i++) makeRequest();

const timer = setInterval(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgLatency = completed > 0 ? (totalLatency / completed).toFixed(0) : '-';
  const rps = completed > 0 ? (completed / (Date.now() - startTime) * 1000).toFixed(0) : '-';
  process.stdout.write(`  \r${elapsed}s | ${completed} req | ${rps} rps | avg ${avgLatency}ms | ${errors} errors  `);
}, 1000);

setTimeout(() => {
  clearInterval(timer);
  const elapsed = (Date.now() - startTime) / 1000;
  const avgLatency = completed > 0 ? (totalLatency / completed).toFixed(0) : '-';
  const rps = (completed / elapsed).toFixed(0);
  console.log(`\n\n  === Results ===`);
  console.log(`  Total requests: ${completed}`);
  console.log(`  Avg RPS: ${rps}`);
  console.log(`  Avg latency: ${avgLatency}ms`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Error rate: ${completed > 0 ? ((errors / completed) * 100).toFixed(1) : 0}%\n`);
  process.exit(0);
}, DURATION * 1000);
