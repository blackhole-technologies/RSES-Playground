/**
 * Smoke Test - Quick sanity check
 * Verifies endpoints are responsive
 * Run: k6 run tests/load/smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
    'health: has status field': (r) => JSON.parse(r.body).status !== undefined,
  });

  // Ready check
  const readyRes = http.get(`${BASE_URL}/ready`);
  check(readyRes, {
    'ready: status 200 or 503': (r) => r.status === 200 || r.status === 503,
  });

  // Metrics endpoint
  const metricsRes = http.get(`${BASE_URL}/metrics`);
  check(metricsRes, {
    'metrics: status 200': (r) => r.status === 200,
    'metrics: has prometheus format': (r) => r.body.includes('# HELP'),
  });

  // API: List configs
  const configsRes = http.get(`${BASE_URL}/api/configs`);
  check(configsRes, {
    'configs: status 200': (r) => r.status === 200,
    'configs: returns array': (r) => Array.isArray(JSON.parse(r.body)),
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const checks = data.metrics.checks;
  const reqs = data.metrics.http_reqs;
  const duration = data.metrics.http_req_duration;

  return `
=== SMOKE TEST SUMMARY ===
Requests: ${reqs?.values?.count || 0}
Failed: ${data.metrics.http_req_failed?.values?.rate?.toFixed(4) || 0}
Avg Duration: ${duration?.values?.avg?.toFixed(2) || 0}ms
P95 Duration: ${duration?.values['p(95)']?.toFixed(2) || 0}ms
Checks Passed: ${checks?.values?.passes || 0}/${(checks?.values?.passes || 0) + (checks?.values?.fails || 0)}
`;
}
