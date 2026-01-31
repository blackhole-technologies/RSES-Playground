# Module Security Manifest Format

**Version:** 1.0.0
**Author:** Security Specialist Agent (SEC)
**Date:** 2026-02-01

---

## Overview

Every RSES CMS module must include a `module.json` manifest file that declares its security requirements, capabilities, and dependencies. This manifest is validated during installation and used for runtime security enforcement.

## File Location

The manifest must be placed at the root of the module directory:

```
modules/
  my_module/
    module.json          <-- Required manifest
    src/
      index.ts
      ...
    README.md
```

## Complete Schema

```json
{
  "$schema": "https://rses-cms.example/schemas/module-manifest-v1.json",

  "name": "my_awesome_module",
  "displayName": "My Awesome Module",
  "version": "1.0.0",
  "description": "A module that does awesome things",

  "author": {
    "name": "Developer Name",
    "email": "dev@example.com",
    "url": "https://example.com"
  },

  "license": "MIT",
  "homepage": "https://github.com/example/my-module",
  "repository": "https://github.com/example/my-module.git",

  "trustLevel": "community",

  "capabilities": {
    "fileSystem": {
      "read": [
        "config/*.json",
        "data/**/*.txt"
      ],
      "write": [
        "data/cache/**"
      ]
    },
    "network": {
      "outbound": [
        "https://api.example.com/*"
      ],
      "inbound": true
    },
    "database": {
      "tables": ["my_module_*"],
      "operations": ["select", "insert", "update"]
    },
    "process": {
      "spawn": false,
      "env": ["MY_MODULE_API_KEY"]
    },
    "crypto": {
      "encrypt": false,
      "sign": false
    }
  },

  "installPermissions": [
    "administer.modules.all"
  ],

  "definesPermissions": [
    {
      "id": "use.my_module.basic",
      "label": "Use My Module",
      "description": "Basic access to module features",
      "operation": "execute",
      "resource": "module",
      "scope": "restricted",
      "requiredTrustLevel": "standard",
      "dependencies": [],
      "dangerous": false,
      "category": "my_module",
      "weight": 0
    },
    {
      "id": "administer.my_module.settings",
      "label": "Administer Module Settings",
      "description": "Configure module settings and options",
      "operation": "administer",
      "resource": "module",
      "scope": "all",
      "requiredTrustLevel": "admin",
      "dependencies": ["use.my_module.basic"],
      "dangerous": true,
      "category": "my_module",
      "weight": 10
    }
  ],

  "dependencies": [
    {
      "name": "core",
      "version": ">=1.0.0",
      "optional": false
    },
    {
      "name": "rses_engine",
      "version": "^2.0.0",
      "optional": false
    },
    {
      "name": "analytics",
      "version": ">=1.0.0",
      "optional": true
    }
  ],

  "minCmsVersion": "1.0.0",
  "maxCmsVersion": "2.0.0",

  "securityContact": "security@example.com",

  "signatures": [
    {
      "algorithm": "RSA-SHA256",
      "keyId": "rses-release-key-2026",
      "signer": "RSES Security Team <security@rses-cms.example>",
      "signature": "base64-encoded-signature...",
      "signedAt": "2026-01-15T10:30:00Z"
    }
  ],

  "checksums": {
    "package": {
      "algorithm": "sha256",
      "hash": "a1b2c3d4e5f6..."
    },
    "files": {
      "src/index.ts": "abc123...",
      "src/handlers.ts": "def456...",
      "README.md": "789ghi..."
    }
  },

  "securityReview": {
    "status": "approved",
    "reviewer": "security-team@rses-cms.example",
    "reviewedAt": "2026-01-20T14:00:00Z",
    "notes": "Passed security review. No critical issues found.",
    "vulnerabilities": []
  }
}
```

## Field Descriptions

### Basic Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Machine name (lowercase, underscores only) |
| `displayName` | string | Yes | Human-readable name |
| `version` | string | Yes | Semantic version (semver) |
| `description` | string | Yes | Module description |
| `author` | object | Yes | Author information |
| `license` | string | Yes | SPDX license identifier |
| `homepage` | string | No | Module homepage URL |
| `repository` | string | No | Source repository URL |

### Trust Level

```typescript
type TrustLevel = 'core' | 'verified' | 'community' | 'custom' | 'untrusted';
```

| Level | Description | Capabilities |
|-------|-------------|--------------|
| `core` | Built-in RSES modules | Full system access |
| `verified` | Reviewed and signed by RSES team | Extended capabilities |
| `community` | Published on official registry | Standard sandbox |
| `custom` | User-installed, not verified | Restricted sandbox |
| `untrusted` | Unknown source | Heavily restricted |

### Capabilities

#### File System Access

```json
{
  "fileSystem": {
    "read": ["config/*.json", "data/**/*.txt"],
    "write": ["data/cache/**"]
  }
}
```

- Paths are relative to the module directory
- Use glob patterns for flexibility
- Empty arrays = no access
- `**` for recursive, `*` for single level

#### Network Access

```json
{
  "network": {
    "outbound": [
      "https://api.example.com/*",
      "https://cdn.example.com/assets/*"
    ],
    "inbound": true
  }
}
```

- `outbound`: URLs the module can fetch from
- `inbound`: Whether module can register HTTP routes

#### Database Access

```json
{
  "database": {
    "tables": ["my_module_*", "shared_config"],
    "operations": ["select", "insert", "update", "delete"]
  }
}
```

- Tables use SQL LIKE patterns
- Operations: `select`, `insert`, `update`, `delete`

#### Process Access

```json
{
  "process": {
    "spawn": false,
    "env": ["MY_MODULE_API_KEY", "MY_MODULE_DEBUG"]
  }
}
```

- `spawn`: Can create child processes (requires special approval)
- `env`: Environment variables the module needs access to

#### Crypto Access

```json
{
  "crypto": {
    "encrypt": true,
    "sign": false
  }
}
```

### Permissions Defined

Modules can define new permissions for their features:

```json
{
  "definesPermissions": [
    {
      "id": "create.widget.own",
      "label": "Create Widgets",
      "description": "Create new widget entities",
      "operation": "create",
      "resource": "widget",
      "scope": "own",
      "requiredTrustLevel": "standard",
      "dependencies": [],
      "dangerous": false,
      "category": "widgets",
      "weight": 0
    }
  ]
}
```

### Dependencies

```json
{
  "dependencies": [
    {
      "name": "core",
      "version": ">=1.0.0",
      "optional": false
    }
  ]
}
```

- `version`: Semver range expression
- `optional`: If true, module works without this dependency

### Signatures

```json
{
  "signatures": [
    {
      "algorithm": "RSA-SHA256",
      "keyId": "rses-release-key-2026",
      "signer": "RSES Security Team",
      "signature": "base64...",
      "signedAt": "2026-01-15T10:30:00Z"
    }
  ]
}
```

Supported algorithms:
- `RSA-SHA256`
- `ECDSA-SHA256`
- `Ed25519`

### Checksums

```json
{
  "checksums": {
    "package": {
      "algorithm": "sha256",
      "hash": "a1b2c3d4..."
    },
    "files": {
      "src/index.ts": "abc123..."
    }
  }
}
```

## Validation Rules

### Name Validation

```
^[a-z][a-z0-9_]*$
Length: 3-50 characters
```

### Version Validation

Must be valid semver:
```
^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$
```

### Path Pattern Validation

- No `..` sequences
- No absolute paths
- No home directory expansion (`~`)
- Must be under module directory

### URL Validation

- Must be HTTPS for production
- No localhost/private IP in production
- Must match declared patterns

## Signature Verification

```typescript
async function verifyModuleSignature(manifest: ModuleManifest): Promise<boolean> {
  // 1. Get trusted public keys
  const trustedKeys = await getTrustedKeys();

  // 2. Verify each signature
  for (const sig of manifest.signatures) {
    const key = trustedKeys.find(k => k.id === sig.keyId);
    if (!key) continue;

    // 3. Create signature payload (manifest without signatures)
    const payload = createSignaturePayload(manifest);

    // 4. Verify signature
    const isValid = await verifySignature(
      payload,
      sig.signature,
      key.publicKey,
      sig.algorithm
    );

    if (isValid) return true;
  }

  return false;
}
```

## Checksum Verification

```typescript
async function verifyModuleChecksums(
  modulePath: string,
  manifest: ModuleManifest
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const [file, expectedHash] of Object.entries(manifest.checksums.files)) {
    const filePath = path.join(modulePath, file);

    try {
      const content = await fs.readFile(filePath);
      const actualHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');

      if (actualHash !== expectedHash) {
        errors.push(`Checksum mismatch: ${file}`);
      }
    } catch (err) {
      errors.push(`Missing file: ${file}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

## Runtime Enforcement

### Sandbox Configuration

```typescript
interface ModuleSandbox {
  // File system access
  fsReadPaths: string[];
  fsWritePaths: string[];

  // Network access
  allowedUrls: RegExp[];
  canRegisterRoutes: boolean;

  // Database access
  allowedTables: RegExp[];
  allowedOps: Set<string>;

  // Process access
  canSpawn: boolean;
  envWhitelist: Set<string>;
}

function createSandbox(manifest: ModuleManifest): ModuleSandbox {
  return {
    fsReadPaths: manifest.capabilities.fileSystem.read.map(p =>
      path.resolve(moduleDir, p)
    ),
    fsWritePaths: manifest.capabilities.fileSystem.write.map(p =>
      path.resolve(moduleDir, p)
    ),
    allowedUrls: manifest.capabilities.network.outbound.map(u =>
      urlPatternToRegex(u)
    ),
    canRegisterRoutes: manifest.capabilities.network.inbound,
    allowedTables: manifest.capabilities.database.tables.map(t =>
      tablePatternToRegex(t)
    ),
    allowedOps: new Set(manifest.capabilities.database.operations),
    canSpawn: manifest.capabilities.process.spawn,
    envWhitelist: new Set(manifest.capabilities.process.env),
  };
}
```

### File System Interception

```typescript
function createFsProxy(sandbox: ModuleSandbox) {
  return new Proxy(fs, {
    get(target, prop) {
      if (prop === 'readFile' || prop === 'readFileSync') {
        return (filePath: string, ...args: any[]) => {
          if (!isPathAllowed(filePath, sandbox.fsReadPaths)) {
            throw new SecurityError(`Read access denied: ${filePath}`);
          }
          return target[prop](filePath, ...args);
        };
      }

      if (prop === 'writeFile' || prop === 'writeFileSync') {
        return (filePath: string, ...args: any[]) => {
          if (!isPathAllowed(filePath, sandbox.fsWritePaths)) {
            throw new SecurityError(`Write access denied: ${filePath}`);
          }
          return target[prop](filePath, ...args);
        };
      }

      return target[prop];
    },
  });
}
```

### Network Interception

```typescript
function createFetchProxy(sandbox: ModuleSandbox) {
  return async (url: string, options?: RequestInit) => {
    const isAllowed = sandbox.allowedUrls.some(pattern =>
      pattern.test(url)
    );

    if (!isAllowed) {
      throw new SecurityError(`Network access denied: ${url}`);
    }

    return fetch(url, options);
  };
}
```

## Example Manifests

### Minimal Module

```json
{
  "name": "simple_widget",
  "displayName": "Simple Widget",
  "version": "1.0.0",
  "description": "A simple widget module",
  "author": {
    "name": "Developer"
  },
  "license": "MIT",
  "trustLevel": "community",
  "capabilities": {
    "fileSystem": { "read": [], "write": [] },
    "network": { "outbound": [], "inbound": false },
    "database": { "tables": [], "operations": [] },
    "process": { "spawn": false, "env": [] },
    "crypto": { "encrypt": false, "sign": false }
  },
  "dependencies": [
    { "name": "core", "version": ">=1.0.0", "optional": false }
  ],
  "minCmsVersion": "1.0.0",
  "checksums": {
    "package": { "algorithm": "sha256", "hash": "..." },
    "files": {}
  }
}
```

### API Integration Module

```json
{
  "name": "external_api",
  "displayName": "External API Integration",
  "version": "2.1.0",
  "description": "Integrates with external API services",
  "author": {
    "name": "Integration Team",
    "email": "integrations@example.com"
  },
  "license": "Apache-2.0",
  "trustLevel": "verified",
  "capabilities": {
    "fileSystem": {
      "read": ["config/api.json"],
      "write": ["cache/*.json"]
    },
    "network": {
      "outbound": [
        "https://api.service.com/v2/*",
        "https://auth.service.com/oauth/*"
      ],
      "inbound": true
    },
    "database": {
      "tables": ["api_cache", "api_tokens"],
      "operations": ["select", "insert", "update", "delete"]
    },
    "process": {
      "spawn": false,
      "env": ["API_CLIENT_ID", "API_CLIENT_SECRET"]
    },
    "crypto": {
      "encrypt": true,
      "sign": true
    }
  },
  "installPermissions": ["administer.modules.all"],
  "definesPermissions": [
    {
      "id": "use.external_api.query",
      "label": "Query External API",
      "description": "Make read-only queries to the external API",
      "operation": "read",
      "resource": "module",
      "scope": "restricted",
      "requiredTrustLevel": "standard",
      "dependencies": [],
      "dangerous": false,
      "category": "external_api",
      "weight": 0
    }
  ],
  "dependencies": [
    { "name": "core", "version": ">=1.0.0", "optional": false },
    { "name": "oauth", "version": "^1.5.0", "optional": false }
  ],
  "minCmsVersion": "1.0.0",
  "securityContact": "security@example.com",
  "signatures": [
    {
      "algorithm": "Ed25519",
      "keyId": "rses-contrib-key-2026",
      "signer": "RSES Contrib Team",
      "signature": "...",
      "signedAt": "2026-01-25T09:00:00Z"
    }
  ],
  "checksums": {
    "package": { "algorithm": "sha256", "hash": "..." },
    "files": {
      "src/index.ts": "...",
      "src/client.ts": "...",
      "src/auth.ts": "..."
    }
  },
  "securityReview": {
    "status": "approved",
    "reviewer": "security@rses-cms.example",
    "reviewedAt": "2026-01-28T16:00:00Z",
    "notes": "OAuth implementation reviewed. Token storage encrypted.",
    "vulnerabilities": []
  }
}
```

## CLI Commands

```bash
# Validate a module manifest
rses module:validate ./modules/my_module

# Generate checksums for module files
rses module:checksum ./modules/my_module

# Sign a module package
rses module:sign ./modules/my_module --key ~/.rses/signing-key.pem

# Verify module signature
rses module:verify ./modules/my_module

# Install module with security checks
rses module:install my_module --verify-signature --check-vulnerabilities
```
