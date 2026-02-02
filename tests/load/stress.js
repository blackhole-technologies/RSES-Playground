/**
 * Stress Test - Find breaking point
 * Ramps up load until system degrades
 * Run: k6 run tests/load/stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Below normal
    { duration: '2m', target: 100 },   // Normal load
    { duration: '2m', target: 150 },   // Above normal
    { duration: '2m', target: 200 },   // Breaking point?
    { duration: '2m', target: 0 },     // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // Relaxed for stress
    errors: ['rate<0.3'],                // Allow more errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

const SAMPLE_CONFIG = `
sets:
  code: "*.{js,ts,py,go,rs}"
  docs: "*.{md,txt,pdf}"
  media: "*.{jpg,png,mp4}"
topics:
  frontend: "src/client/**"
  backend: "src/server/**"
  tests: "tests/**"
`;

export default function () {
  // Mix of operations
  const ops = [
    () => http.get(`${BASE_URL}/health`),
    () => http.get(`${BASE_URL}/api/configs`),
    () => http.post(
      `${BASE_URL}/api/engine/validate`,
      JSON.stringify({ content: SAMPLE_CONFIG }),
      { headers: { 'Content-Type': 'application/json' } }
    ),
    () => http.get(`${BASE_URL}/api/projects`),
  ];

  const op = ops[Math.floor(Math.random() * ops.length)];
  const res = op();

  const success = check(res, {
    'status is not 5xx': (r) => r.status < 500,
  });
  errorRate.add(!success);

  sleep(0.1); // Minimal think time for stress
}
