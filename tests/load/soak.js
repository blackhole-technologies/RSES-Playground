/**
 * Soak Test - Endurance test for memory leaks
 * Runs at moderate load for extended period
 * Run: k6 run tests/load/soak.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const memoryTrend = new Trend('memory_usage');
const requestCount = new Counter('total_requests');

export const options = {
  stages: [
    { duration: '2m', target: 20 },    // Ramp up
    { duration: '26m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

const CONFIGS = [
  { content: 'sets:\n  docs: "*.md"' },
  { content: 'sets:\n  code: "*.{js,ts}"' },
  { content: 'topics:\n  work: "projects/**"' },
];

export default function () {
  requestCount.add(1);

  // Varied operations to test different code paths
  const iteration = __ITER % 10;

  if (iteration < 4) {
    // 40% - Config listing
    http.get(`${BASE_URL}/api/configs`);
  } else if (iteration < 7) {
    // 30% - Validation (exercises parser)
    const config = CONFIGS[Math.floor(Math.random() * CONFIGS.length)];
    http.post(
      `${BASE_URL}/api/engine/validate`,
      JSON.stringify(config),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } else if (iteration < 9) {
    // 20% - Health checks
    http.get(`${BASE_URL}/health`);
    http.get(`${BASE_URL}/ready`);
  } else {
    // 10% - Metrics (check for memory growth)
    const res = http.get(`${BASE_URL}/metrics`);
    check(res, {
      'metrics available': (r) => r.status === 200,
    });

    // Try to extract heap usage from metrics
    const heapMatch = res.body.match(/nodejs_heap_size_used_bytes\s+(\d+)/);
    if (heapMatch) {
      memoryTrend.add(parseInt(heapMatch[1]) / 1024 / 1024); // MB
    }
  }

  sleep(1 + Math.random()); // 1-2s think time
}
