# Security Checklists

**Version:** 1.0.0
**Author:** Security Specialist Agent (SEC)
**Date:** 2026-02-01

---

## Table of Contents

1. [Module Security Checklist](#module-security-checklist)
2. [Theme Security Checklist](#theme-security-checklist)
3. [RSES Config Security Checklist](#rses-config-security-checklist)
4. [Deployment Security Checklist](#deployment-security-checklist)
5. [Code Review Security Checklist](#code-review-security-checklist)
6. [Incident Response Checklist](#incident-response-checklist)

---

## Module Security Checklist

Use this checklist when reviewing or developing modules for the RSES CMS.

### Pre-Development

- [ ] **Threat Model:** Document potential security threats for this module
- [ ] **Minimum Privileges:** Identify minimum required capabilities
- [ ] **Data Classification:** Identify what sensitive data the module handles
- [ ] **Dependency Audit:** Review all dependencies for known vulnerabilities

### Manifest Validation

- [ ] **Name Format:** Module name follows pattern `^[a-z][a-z0-9_]*$`
- [ ] **Version Format:** Version is valid semver
- [ ] **Author Info:** Author contact information provided
- [ ] **License:** Valid SPDX license identifier
- [ ] **Trust Level:** Appropriate trust level declared
- [ ] **Capabilities:** All required capabilities explicitly declared
- [ ] **Dependencies:** All dependencies listed with version constraints
- [ ] **Permissions:** Custom permissions properly defined

### Code Security

#### Injection Prevention

- [ ] **No eval():** Code does not use `eval()` or `new Function()`
- [ ] **No dynamic require:** Does not use dynamic `require()` or `import()`
- [ ] **SQL Parameterized:** All SQL queries use parameterized statements
- [ ] **Command Sanitized:** Any shell commands use proper escaping
- [ ] **Template Safe:** Template rendering escapes all user input
- [ ] **JSON Parse Safe:** JSON.parse() wrapped in try-catch

#### Input Validation

- [ ] **Schema Validation:** All inputs validated with Zod schemas
- [ ] **Type Checking:** Strict type checking enabled
- [ ] **Size Limits:** Input size limits enforced
- [ ] **Encoding Check:** Character encoding validated
- [ ] **Path Validation:** File paths checked for traversal
- [ ] **URL Validation:** URLs validated for safe protocols

#### Authentication & Authorization

- [ ] **Auth Check:** All protected endpoints verify authentication
- [ ] **Permission Check:** Operations verify user has required permission
- [ ] **Session Handling:** Session data not exposed to client
- [ ] **Token Security:** Tokens are cryptographically secure
- [ ] **Rate Limiting:** Sensitive operations are rate-limited

#### Data Protection

- [ ] **Sensitive Data:** Sensitive data encrypted at rest
- [ ] **Logging Safe:** Sensitive data not logged
- [ ] **Error Messages:** Error messages don't leak internals
- [ ] **Memory Clear:** Sensitive data cleared from memory after use
- [ ] **Temporary Files:** Temp files created securely and cleaned up

#### File System Security

- [ ] **Path Traversal:** All file paths validated
- [ ] **Symlink Safe:** Symlink targets verified
- [ ] **Permission Check:** File permissions checked before operations
- [ ] **Directory Restriction:** Operations limited to declared paths
- [ ] **Temp File Security:** Temp files use secure random names

#### Network Security

- [ ] **HTTPS Only:** External requests use HTTPS
- [ ] **Certificate Validation:** TLS certificates validated
- [ ] **Timeout Configured:** Network requests have timeouts
- [ ] **Response Validation:** External responses validated
- [ ] **URL Whitelist:** Only declared URLs accessed

#### Cryptography

- [ ] **Modern Algorithms:** Uses modern, secure algorithms
- [ ] **Secure Random:** Uses crypto.randomBytes() for randomness
- [ ] **Key Management:** Keys stored securely, not in code
- [ ] **No Custom Crypto:** Uses standard crypto libraries
- [ ] **Salt Usage:** Hashes include proper salts

### Testing

- [ ] **Unit Tests:** Security-critical functions have unit tests
- [ ] **Integration Tests:** API endpoints tested for auth/authz
- [ ] **Fuzzing:** Input handlers tested with fuzzing
- [ ] **Dependency Scan:** npm audit or similar passes
- [ ] **Static Analysis:** ESLint security rules pass
- [ ] **Manual Review:** Code manually reviewed by security-aware developer

### Documentation

- [ ] **Security Notes:** README includes security considerations
- [ ] **Permissions Docs:** Custom permissions documented
- [ ] **Config Security:** Secure configuration options explained
- [ ] **Upgrade Notes:** Security-relevant upgrade notes included

### Deployment

- [ ] **Signature:** Module is signed with trusted key
- [ ] **Checksums:** File checksums match manifest
- [ ] **Changelog:** Security changes documented in changelog
- [ ] **Version Bump:** Version appropriately incremented

---

## Theme Security Checklist

Use this checklist when reviewing or developing themes for the RSES CMS.

### Structure Validation

- [ ] **Manifest Present:** Valid `theme.json` manifest exists
- [ ] **Required Files:** All required files present
- [ ] **No Executables:** No `.php`, `.py`, `.sh`, `.exe` files
- [ ] **No Hidden Files:** No hidden files (except allowed like `.gitignore`)
- [ ] **Proper Directories:** Files organized in proper directories

### Template Security

- [ ] **No Inline JS:** No `<script>` tags with inline JavaScript
- [ ] **No Event Handlers:** No inline event handlers (`onclick`, etc.)
- [ ] **No JS URLs:** No `javascript:` URLs
- [ ] **Variable Escaping:** All template variables escaped
- [ ] **Safe Includes:** Template includes validated
- [ ] **No Raw HTML:** User content not rendered as raw HTML
- [ ] **CSRF Tokens:** Forms include CSRF token
- [ ] **Nonce/Hash:** Scripts use CSP nonce or hash

### CSS Security

- [ ] **No @import External:** No `@import` from external domains
- [ ] **No CSS Expressions:** No IE CSS expressions
- [ ] **No External url():** No `url()` to external resources
- [ ] **No Data URIs JS:** No `data:text/javascript` URIs
- [ ] **Safe Fonts:** Fonts from trusted sources only

### Asset Security

- [ ] **Image Validation:** Images validated for format/size
- [ ] **No Obfuscation:** No obfuscated JavaScript
- [ ] **SRI Hashes:** External scripts have integrity hashes
- [ ] **MIME Types:** Correct MIME types configured
- [ ] **Size Limits:** Asset size limits enforced

### CSP Compliance

- [ ] **Script Sources:** All scripts from 'self' or trusted CDN
- [ ] **Style Sources:** All styles from 'self' or trusted sources
- [ ] **Image Sources:** Images from declared sources
- [ ] **Font Sources:** Fonts from declared sources
- [ ] **No unsafe-eval:** No reliance on 'unsafe-eval'
- [ ] **Frame Ancestors:** Appropriate frame-ancestors set

### Accessibility (Security-Adjacent)

- [ ] **Form Labels:** Forms have proper labels
- [ ] **ARIA Roles:** Interactive elements have roles
- [ ] **Focus Management:** Focus handled properly
- [ ] **Error Indication:** Errors clearly indicated

---

## RSES Config Security Checklist

Use this checklist when reviewing RSES configuration files.

### Syntax Validation

- [ ] **Valid Syntax:** Config parses without syntax errors
- [ ] **Section Headers:** All sections properly formatted
- [ ] **Arrow Syntax:** Rules use correct `->` syntax
- [ ] **No Stray Characters:** No unexpected characters

### Pattern Safety

- [ ] **No ReDoS:** Patterns checked for ReDoS vulnerabilities
- [ ] **Simple Globs:** Patterns use simple glob syntax
- [ ] **No Complex Regex:** Avoid complex regex features
- [ ] **Length Limits:** Pattern length within limits

### Path Security

- [ ] **No Traversal:** No `..` in rule results
- [ ] **No Absolute Paths:** No absolute paths in results
- [ ] **No Home Expansion:** No `~` in paths
- [ ] **Safe Characters:** Paths use safe characters only

### Expression Safety

- [ ] **Valid Expressions:** Compound expressions valid
- [ ] **No Injection:** No code injection in expressions
- [ ] **Depth Limits:** Expression nesting within limits
- [ ] **Reference Validity:** Set references exist

### Logical Correctness

- [ ] **No Cycles:** No circular dependencies
- [ ] **Reachable Sets:** All sets reachable/used
- [ ] **Meaningful Rules:** Rules have meaningful conditions
- [ ] **Priority Order:** Rule priority makes sense

### Resource Limits

- [ ] **File Size:** Config within size limit (512KB)
- [ ] **Set Count:** Number of sets within limit
- [ ] **Rule Count:** Number of rules within limit
- [ ] **Complexity:** Overall complexity reasonable

---

## Deployment Security Checklist

Use this checklist when deploying RSES CMS to production.

### Environment Configuration

- [ ] **NODE_ENV:** Set to "production"
- [ ] **SESSION_SECRET:** Strong random secret set
- [ ] **Database Credentials:** Secure credentials configured
- [ ] **API Keys:** All required API keys configured
- [ ] **Debug Disabled:** Debug mode disabled
- [ ] **Secrets Rotation:** Plan for secret rotation

### TLS/SSL Configuration

- [ ] **HTTPS Enabled:** All traffic over HTTPS
- [ ] **Valid Certificate:** Certificate from trusted CA
- [ ] **Strong Ciphers:** TLS 1.2+ with strong ciphers
- [ ] **HSTS Enabled:** HSTS header configured
- [ ] **Certificate Renewal:** Auto-renewal configured

### Security Headers

- [ ] **CSP:** Content-Security-Policy configured
- [ ] **X-Frame-Options:** Set to DENY or SAMEORIGIN
- [ ] **X-Content-Type-Options:** Set to nosniff
- [ ] **Referrer-Policy:** Appropriate policy set
- [ ] **Permissions-Policy:** Restrictive policy set

### Network Security

- [ ] **Firewall:** Firewall rules configured
- [ ] **DDoS Protection:** DDoS mitigation in place
- [ ] **Rate Limiting:** Rate limiting configured
- [ ] **IP Allowlisting:** Admin access IP-restricted
- [ ] **VPN/Private Network:** Sensitive endpoints protected

### Authentication

- [ ] **Strong Passwords:** Password policy enforced
- [ ] **MFA Available:** Multi-factor auth available
- [ ] **Session Security:** Secure session configuration
- [ ] **Account Lockout:** Lockout after failed attempts
- [ ] **Default Accounts:** Default accounts disabled

### Database Security

- [ ] **Minimal Privileges:** DB user has minimal privileges
- [ ] **Encrypted Connections:** DB connections encrypted
- [ ] **Backup Encryption:** Backups encrypted
- [ ] **Access Logging:** DB access logged
- [ ] **Regular Backups:** Automated backups configured

### Monitoring & Logging

- [ ] **Audit Logging:** Security audit logging enabled
- [ ] **Log Protection:** Logs stored securely
- [ ] **Log Retention:** Appropriate retention policy
- [ ] **Alerting:** Security alerts configured
- [ ] **Metrics Collection:** Security metrics collected

### Dependency Management

- [ ] **Vulnerability Scan:** No known vulnerabilities
- [ ] **Update Process:** Process for security updates
- [ ] **Lock Files:** Dependency versions locked
- [ ] **Minimal Dependencies:** Only necessary deps

### Incident Preparation

- [ ] **Response Plan:** Incident response plan documented
- [ ] **Contact List:** Security contact list maintained
- [ ] **Backup Recovery:** Backup recovery tested
- [ ] **Rollback Plan:** Deployment rollback tested

---

## Code Review Security Checklist

Use this checklist during security-focused code reviews.

### General

- [ ] **Diff Review:** All changes reviewed, not just new code
- [ ] **Context Check:** Changes make sense in context
- [ ] **Test Coverage:** Security-relevant changes have tests
- [ ] **Documentation:** Security changes documented

### Input Handling

- [ ] **Validation Present:** All inputs validated
- [ ] **Validation Correct:** Validation logic correct
- [ ] **Error Handling:** Invalid input handled gracefully
- [ ] **Type Safety:** TypeScript types enforced

### Authentication

- [ ] **Auth Required:** Protected routes check auth
- [ ] **Auth Correct:** Auth check logic correct
- [ ] **Session Handling:** Sessions handled properly
- [ ] **Token Security:** Tokens generated/validated securely

### Authorization

- [ ] **Authz Required:** Operations check permissions
- [ ] **Authz Correct:** Permission checks correct
- [ ] **Privilege Escalation:** No privilege escalation possible
- [ ] **IDOR Prevention:** Object access verified

### Data Handling

- [ ] **Sensitive Data:** Sensitive data protected
- [ ] **Encryption:** Encryption used where needed
- [ ] **Logging:** Sensitive data not logged
- [ ] **Memory:** Sensitive data cleared after use

### Output Handling

- [ ] **Encoding:** Output properly encoded
- [ ] **Headers:** Security headers set
- [ ] **Error Messages:** No sensitive info in errors
- [ ] **Content-Type:** Correct content types set

### Dependencies

- [ ] **New Dependencies:** New deps necessary and vetted
- [ ] **Version Pins:** Versions appropriately constrained
- [ ] **Vulnerability Check:** No known vulnerabilities

---

## Incident Response Checklist

Use this checklist when responding to a security incident.

### Initial Response (First 15 Minutes)

- [ ] **Confirm Incident:** Verify the incident is real
- [ ] **Assess Severity:** Determine impact level
- [ ] **Notify Team:** Alert security response team
- [ ] **Start Documentation:** Begin incident timeline
- [ ] **Preserve Evidence:** Don't destroy logs/artifacts

### Containment (First Hour)

- [ ] **Isolate Systems:** Contain affected systems
- [ ] **Block Attacker:** Block malicious IPs/accounts
- [ ] **Disable Compromised Accounts:** Lock affected accounts
- [ ] **Preserve State:** Snapshot affected systems
- [ ] **Monitor Spread:** Watch for lateral movement

### Investigation (Ongoing)

- [ ] **Timeline:** Establish incident timeline
- [ ] **Entry Point:** Identify how attacker got in
- [ ] **Scope:** Determine what was accessed/affected
- [ ] **Data Impact:** Assess data exposure
- [ ] **Artifacts:** Collect forensic artifacts

### Eradication

- [ ] **Root Cause:** Identify and fix root cause
- [ ] **Patches Applied:** Security patches deployed
- [ ] **Credentials Rotated:** Affected credentials rotated
- [ ] **Malware Removed:** Any malware removed
- [ ] **Verification:** Verify eradication complete

### Recovery

- [ ] **System Restore:** Restore from clean backups
- [ ] **Monitoring Enhanced:** Increase monitoring
- [ ] **User Notification:** Notify affected users
- [ ] **Service Restoration:** Restore services carefully
- [ ] **Verification:** Verify systems clean

### Post-Incident

- [ ] **Incident Report:** Document full incident
- [ ] **Lessons Learned:** Conduct retrospective
- [ ] **Process Updates:** Update security processes
- [ ] **Tool Updates:** Improve detection tools
- [ ] **Training:** Address any training gaps

### Communication

- [ ] **Internal Comms:** Keep stakeholders informed
- [ ] **External Comms:** Public notification if needed
- [ ] **Regulatory:** Report to regulators if required
- [ ] **Legal:** Consult legal if needed
- [ ] **PR:** Coordinate with PR/communications

---

## Checklist Usage Guidelines

### When to Use Each Checklist

| Checklist | When to Use |
|-----------|-------------|
| Module Security | Before publishing/installing modules |
| Theme Security | Before publishing/installing themes |
| RSES Config | When creating/modifying configs |
| Deployment | Before/during production deployments |
| Code Review | During all code reviews |
| Incident Response | When security incident detected |

### Severity Ratings

| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical - Must fix before proceeding |
| 🟠 | High - Should fix before release |
| 🟡 | Medium - Fix in next iteration |
| 🟢 | Low - Nice to have |

### Documentation

For each checklist completion:

1. Record the date and reviewer
2. Note any exceptions with justification
3. Track items to be addressed later
4. Archive completed checklists

### Automation

Many checklist items can be automated:

```bash
# Run automated security checks
rses security:check --module ./modules/my_module
rses security:check --theme ./themes/my_theme
rses security:check --config ./configs/production.rses
rses security:audit --deployment
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-01 | SEC | Initial version |
