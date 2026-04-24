# Restoration Checklist for New Sessions

Use this checklist when starting a new Claude session to restore context quickly.

---

## Quick Context Load (2 minutes)

- [ ] Read `docs/SESSION-HANDOFF.md` for current state
- [ ] Check `docs/CHANGELOG.md` for recent changes
- [ ] Review `QUICK-REFERENCE.md` for commands

---

## Verification Tests (5 minutes)

### 1. Scripts Exist and Execute
```bash
cd ~/Projects
ls -la auto-link*.sh lib/*.zsh
```
Expected: All scripts present with execute permissions

### 2. Run Master Script
```bash
./auto-link-all.sh --no-files
```
Expected: Completes without errors, shows statistics

### 3. Check Security Library
```bash
source lib/security.zsh
echo "Security library loaded: $(type validate_boundary)"
```
Expected: Shows function definition

### 4. Check Ignore Library
```bash
source lib/ignore.zsh
echo "Ignore library loaded: $(type should_skip_dir)"
```
Expected: Shows function definition

### 5. Verify Symlinks Created
```bash
ls -la by-topic/ 2>/dev/null | head -5
ls -la by-type/ 2>/dev/null | head -5
ls -la by-filetype/code/ 2>/dev/null | head -5
```
Expected: Symlinks pointing to by-ai/ projects

### 6. Check Audit Log
```bash
tail -20 .audit.log
```
Expected: Recent SYMLINK_CREATED entries

---

## "Ready to Continue" Criteria

All must be true:
- [ ] Scripts execute without syntax errors
- [ ] Security library sources correctly
- [ ] Ignore library sources correctly
- [ ] At least one symlink exists in by-topic/
- [ ] Audit log shows recent activity
- [ ] No ERROR entries in recent audit log

---

## If Something's Wrong

### Scripts Won't Run
```bash
# Check for syntax errors
zsh -n auto-link-all.sh
zsh -n lib/security.zsh
zsh -n lib/ignore.zsh
```

### No Symlinks Created
1. Check if source projects exist: `ls by-ai/*/`
2. Check if projects match naming pattern
3. Run with verbose output: `./auto-link-all.sh`

### Audit Log Errors
```bash
grep -i "error\|blocked\|failed" .audit.log | tail -20
```

### Permission Issues
```bash
chmod +x auto-link*.sh
chmod 600 .audit.log
```

---

## Document Locations

| Need | Read |
|------|------|
| Current state | `docs/SESSION-HANDOFF.md` |
| Technical details | `docs/SYSTEM.md` |
| Recent changes | `docs/CHANGELOG.md` |
| Quick commands | `QUICK-REFERENCE.md` |
| Implementation status | `docs/CURRENT-STATE.md` |

---

## Agent Reference

| Task | Agent |
|------|-------|
| Script changes | `agents/auto-link-developer.md` |
| Security audit | `agents/security-specialist.md` |
| File watcher | `agents/file-watcher-specialist.md` |
| Preview system | `agents/preview-generator.md` |
| Web CMS | `agents/cms-developer.md` |
| Architecture | `agents/project-architect.md` |

---

## Confirm Context Restored

After completing checklist, confirm:

```
I've reviewed the Auto-Link system:
- Core scripts: Working (auto-link-all.sh, topic, type, files)
- Security: Complete (lib/security.zsh)
- Ignore system: Complete (lib/ignore.zsh)
- Next steps: [testing/file-watcher/preview/CMS]
- Ready to continue with: [specific task]
```
