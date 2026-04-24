/**
 * Load Test - Normal traffic simulation
 * Simulates typical production load
 * Run: k6 run tests/load/load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const configsDuration = new Trend('configs_duration');
const validateDuration = new Trend('validate_duration');

export const options = {
  stages: [
    { duration: '1m', target: 25 },   // Ramp up
    { duration: '3m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

const SAMPLE_CONFIG = `
sets:
  documents: "*.{doc,docx,pdf}"
  images: "*.{jpg,png,gif}"
topics:
  work: "projects/**"
  personal: "home/**"
`;

export default function () {
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Read configs
    const res = http.get(`${BASE_URL}/api/configs`);
    configsDuration.add(res.timings.duration);
    const success = check(res, {
      'configs: status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  } else if (scenario < 0.7) {
    // 30% - Health checks
    http.get(`${BASE_URL}/health`);
    http.get(`${BASE_URL}/ready`);
  } else if (scenario < 0.9) {
    // 20% - Validate config
    const res = http.post(
      `${BASE_URL}/api/engine/validate`,
      JSON.stringify({ content: SAMPLE_CONFIG }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    validateDuration.add(res.timings.duration);
    const success = check(res, {
      'validate: status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  } else {
    // 10% - Read projects
    const res = http.get(`${BASE_URL}/api/projects`);
    check(res, {
      'projects: status 200': (r) => r.status === 200,
    });
  }

  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}
