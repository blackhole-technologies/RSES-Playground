# Remote Automation Engine

> Phase 10 - Remote Automation for RSES CMS

## Overview

The Remote Automation Engine provides comprehensive automation capabilities for RSES CMS, enabling scheduled tasks, webhook triggers, API-driven automation, and cross-site orchestration. Inspired by industry leaders like Zapier, n8n, GitHub Actions, and Temporal.io.

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Trigger System  |     |   Workflow Engine |     |  Action Registry  |
|-------------------|     |-------------------|     |-------------------|
| - Cron Scheduler  |---->| - Step Execution  |---->| - Built-in Actions|
| - Webhooks        |     | - Conditions      |     | - Custom Actions  |
| - Events          |     | - Loops           |     | - Compensation    |
| - API Triggers    |     | - Parallel Exec   |     | - Retry/Circuit   |
+-------------------+     +-------------------+     +-------------------+
         |                         |                         |
         v                         v                         v
+-------------------+     +-------------------+     +-------------------+
| Cross-Site Orch.  |     |   Monitoring      |     | Integration Hub   |
|-------------------|     |-------------------|     |-------------------|
| - Federation      |     | - Run History     |     | - OAuth Manager   |
| - Site-to-Site    |     | - Metrics         |     | - Connectors      |
| - Dist. Workflows |     | - Alerts          |     | - Credentials     |
+-------------------+     +-------------------+     +-------------------+
```

## Features

### Trigger System

- **Cron Scheduling**: Standard cron expressions with timezone support
- **Interval Triggers**: Fixed-interval execution
- **Webhook Triggers**: HTTP receivers with HMAC validation
- **Event Triggers**: React to CMS events
- **API Triggers**: Programmatic workflow initiation
- **Manual Triggers**: User-initiated with optional forms
- **Cross-Site Triggers**: React to events from federated sites

### Workflow Engine

- **Visual Builder Support**: Node-based workflow representation
- **Step Types**:
  - Action: Execute registered actions
  - Condition: If/else branching
  - Loop: Iterate over collections
  - Parallel: Concurrent execution branches
  - Wait: Delays and event waits
  - Transform: Data manipulation
  - Subworkflow: Nested workflow calls
  - Approval: Human-in-the-loop
  - Cross-Site: Remote action execution

### Built-in Actions

| Category | Actions |
|----------|---------|
| Content | Publish, Unpublish, Clone |
| Taxonomy | Update, Bulk Update, Sync |
| Media | Process, Generate Thumbnails |
| Report | Generate, Schedule |
| Backup | Execute, Restore |
| Cache | Clear, Warm |
| Health | Check, Ping |
| Utility | HTTP Request, Notify, Wait, Transform |

### Integration Connectors

Pre-built connectors for common services:

- **Webhook**: Send/receive HTTP webhooks
- **HTTP**: Generic HTTP requests
- **Email**: SMTP email sending
- **Slack**: Messages, channels, files
- **GitHub**: Issues, PRs, releases
- **Google Sheets**: Read/write spreadsheet data

### Cross-Site Orchestration

- Site federation and discovery
- Secure message signing (RSA)
- Distributed workflow execution
- Cross-site event propagation
- Health monitoring

### Monitoring & Observability

- Run history with retention
- Time series metrics
- Configurable alerts
- Audit logging
- Performance analytics

## Usage

### Initialization

```typescript
import { initializeAutomationEngine } from './server/services/automation';

const engine = initializeAutomationEngine({
  siteName: 'My CMS Site',
  siteUrl: 'https://cms.example.com',
  encryptionKey: 'your-32-char-encryption-key-here',
  enableCrossSite: true,
  enableMonitoring: true,
});
```

### Creating a Workflow

```typescript
import {
  createCronTrigger,
  createActionInstance,
  WorkflowStatus,
  StepType,
  ErrorStrategy,
} from './server/services/automation';

const workflow = {
  id: 'daily-backup',
  metadata: {
    name: 'Daily Backup',
    description: 'Performs daily system backup',
    tags: ['backup', 'scheduled'],
    createdBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    crossSiteEnabled: false,
    maxConcurrency: 1,
    timeout: 3600000, // 1 hour
    retry: {
      maxAttempts: 3,
      baseDelay: 5000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      useJitter: true,
      retryableErrors: ['NETWORK_ERROR', 'TIMEOUT'],
    },
    errorStrategy: ErrorStrategy.COMPENSATE,
  },
  status: WorkflowStatus.ACTIVE,
  triggers: [
    createCronTrigger({
      name: 'Daily at 2 AM',
      enabled: true,
      expression: '0 2 * * *',
      timezone: 'America/New_York',
      catchUp: false,
      maxCatchUp: 1,
    }),
  ],
  steps: [
    {
      id: 'backup-database',
      type: StepType.ACTION,
      name: 'Backup Database',
      dependsOn: [],
      enabled: true,
      action: createActionInstance('backup.execute', {
        scope: 'incremental',
        targets: ['database'],
        destination: { type: 's3', config: { bucket: 'backups' } },
        compression: 'gzip',
      }),
      outputVariable: 'dbBackupResult',
    },
    {
      id: 'notify-complete',
      type: StepType.ACTION,
      name: 'Send Notification',
      dependsOn: ['backup-database'],
      enabled: true,
      action: createActionInstance('utility.notify', {
        channel: 'slack',
        message: 'Daily backup completed: {{dbBackupResult.backupId}}',
      }),
    },
  ],
  variables: {},
  notifications: {
    onSuccess: [],
    onFailure: [{ type: 'email', target: 'admin@example.com' }],
    onTimeout: [],
    onPause: [],
  },
};

engine.workflowEngine.registerWorkflow(workflow);
```

### Webhook Integration

```typescript
// Express route for webhook handling
app.post('/api/webhooks/:path', async (req, res) => {
  const result = await engine.triggerRegistry.handleWebhook(
    req.params.path,
    req.method,
    req.headers as Record<string, string>,
    req.body,
    req.ip
  );

  if (result.matched) {
    res.status(200).json({ success: true, triggerId: result.triggerId });
  } else {
    res.status(404).json({ error: 'No matching webhook trigger' });
  }
});
```

### Custom Actions

```typescript
import { getActionRegistry } from './server/services/automation';

const registry = getActionRegistry();

registry.register({
  type: 'custom.myAction',
  name: 'My Custom Action',
  description: 'Does something custom',
  category: 'custom',
  inputSchema: z.object({
    param1: z.string(),
    param2: z.number(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  idempotent: true,
  compensatable: true,
  defaultTimeout: 30000,
  defaultRetry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    useJitter: true,
    retryableErrors: ['NETWORK_ERROR'],
  },
  handler: async (input, context) => {
    context.logger.info('Executing custom action', { input });
    return { result: `Processed: ${input.param1}` };
  },
  compensation: async (input, output, context) => {
    context.logger.info('Compensating custom action');
  },
});
```

### Cross-Site Federation

```typescript
import { getFederationManager } from './server/services/automation';

const federation = getFederationManager();

// Add federated site
await federation.addFederation({
  siteId: 'remote-site-id',
  name: 'Remote CMS',
  url: 'https://remote-cms.example.com',
  publicKey: '-----BEGIN PUBLIC KEY-----\n...',
  trustLevel: 'full',
  allowedActions: ['content.publish', 'taxonomy.update'],
  allowedEvents: ['content.*'],
  status: 'active',
});

// Execute action on remote site
const result = await federation.requestAction(
  'remote-site-id',
  createActionInstance('content.publish', { contentId: '123' }),
  { userId: 'admin' }
);
```

### Monitoring & Alerts

```typescript
import { getAutomationMonitor } from './server/services/automation';

const monitor = getAutomationMonitor();

// Get metrics
const metrics = monitor.getMetrics({
  startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
  endTime: new Date(),
});

console.log(`Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
console.log(`Avg duration: ${metrics.averageDurationMs}ms`);

// Get active alerts
const alerts = monitor.getActiveAlerts();
alerts.forEach(alert => {
  console.log(`[${alert.severity}] ${alert.message}`);
});

// Query audit log
const auditEntries = monitor.getAuditLog({
  entityType: 'execution',
  startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  limit: 100,
});
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTOMATION_ENCRYPTION_KEY` | Credential encryption key (min 32 chars) | Required |
| `AUTOMATION_SITE_NAME` | Site identification name | Required |
| `AUTOMATION_SITE_URL` | Site base URL | Required |
| `AUTOMATION_ENABLE_CROSS_SITE` | Enable federation | `false` |
| `AUTOMATION_MAX_CONCURRENT` | Max concurrent executions | `10` |
| `AUTOMATION_RETENTION_DAYS` | Run history retention | `30` |

### Alert Configuration

```typescript
alertManager.registerAlert({
  id: 'custom-alert',
  name: 'Custom Alert',
  condition: {
    metric: 'error_rate',
    operator: 'gt',
    threshold: 0.05, // 5%
    windowMs: 300000, // 5 minutes
    minSamples: 10,
  },
  channels: [
    { type: 'slack', target: '#alerts' },
    { type: 'email', target: 'ops@example.com' },
  ],
  cooldownMs: 900000, // 15 minutes
  enabled: true,
});
```

## Security

### Webhook Security

- HMAC signature validation (SHA-256/SHA-512)
- IP whitelist support
- Request schema validation
- Rate limiting

### Credential Storage

- AES-256-GCM encryption
- Scrypt key derivation
- Per-credential salt and IV

### Cross-Site Security

- RSA message signing
- Public key verification
- Trust levels (full/limited/none)
- Action/event allowlists

## Performance

### Scalability

- Non-blocking async execution
- Configurable concurrency limits
- Circuit breaker pattern
- Exponential backoff with jitter

### Reliability

- Durable execution state
- Automatic retry with backoff
- Dead letter queue for failures
- Saga pattern for compensation

## API Reference

See individual module documentation:

- [Types](../../server/services/automation/types.ts)
- [Trigger System](../../server/services/automation/trigger-system.ts)
- [Action Registry](../../server/services/automation/action-registry.ts)
- [Workflow Engine](../../server/services/automation/workflow-engine.ts)
- [Cross-Site Orchestration](../../server/services/automation/cross-site-orchestration.ts)
- [Integration Connectors](../../server/services/automation/integration-connectors.ts)
- [Monitoring](../../server/services/automation/monitoring.ts)

## License

MIT
