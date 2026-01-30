# RSES Hybrid Architecture Design

**Status:** APPROVED (Multi-agent consensus)
**Date:** 2026-01-30
**Authors:** @project-architect, @set-graph-theorist, @systems-analyst, @auto-link-developer, @security-specialist, @prompting-expert

---

## Executive Summary

The RSES architecture will evolve from **explicit mappings** to a **hybrid approach** combining:
1. **Auto-extraction** of prefix/suffix from project names
2. **Override tables** for semantic normalization
3. **Set algebra** for compound expressions

This design was unanimously recommended by all 6 specialist agents.

---

## Current State (Phase 1 Complete)

```ini
# Explicit mappings - verbose but working
[sets]
quantum = quantum-*

[rules.topic]
$quantum -> quantum    # Redundant: "quantum" x3
```

**Limitations:**
- Every new prefix requires config update
- Redundant mappings (prefix == category in most cases)
- No self-organization

---

## Target State (Phases 2-3)

```ini
[defaults]
auto_topic = prefix    # Extract first hyphen-segment
auto_type = suffix     # Extract last hyphen-segment
delimiter = -

[overrides.topic]
# Only exceptions to auto-derived categories
util = tools-and-utilities
viz = visualizations
sacred-geo = sacred-geometry

[overrides.type]
# Only exceptions
viz = visualization

[sets]
# Set algebra still works!
claude = {source = claude}
quantum = {prefix = quantum}

[sets.compound]
claude-quantum = $claude & $quantum
```

---

## Layer Architecture

```
Layer 0: Alphabet (Σ)
         Valid characters in names: a-z, 0-9, -, _

Layer 1: Patterns (P)
         Regular expressions: tool-*, *-lib

Layer 1.5: Name Parsing (NEW)
         Derived attributes:
         - prefix(p) = first segment before delimiter
         - suffix(p) = last segment after delimiter

Layer 2: Sets (S)
         Collections from:
         - Patterns: tool-*
         - Attributes: {source = claude}
         - Derived attributes: {prefix = quantum}
         - References: $tools

Layer 3: Expressions (E)
         Boolean operations: $claude & $quantum

Layer 4: Rules (R)
         Mappings: expression -> category
         Auto-rules: extracted prefix/suffix -> category (with overrides)
```

---

## Implementation Plan

### Phase 1: Explicit Mappings (COMPLETE)

```
Status: DONE
Files modified:
  - .autolink.conf (119 mappings)
  - bin/rses-watch (file watcher)
  - docs/* (updated documentation)

Parity achieved: 100% match with shell scripts
Tests passing: 205
```

### Phase 2: Scanner Enhancement

**Goal:** Add prefix/suffix extraction to scanner.zsh

```zsh
# New functions in lib/rses/scanner.zsh

rses_extract_prefix() {
    local name="$1"
    local delimiter="${RSES_DELIMITER:--}"

    # Extract first segment
    local prefix="${name%%$delimiter*}"

    # Security: validate
    if ! validate_category "$prefix" 2>/dev/null; then
        echo "uncategorized"
        return
    fi

    echo "$prefix"
}

rses_extract_suffix() {
    local name="$1"
    local delimiter="${RSES_DELIMITER:--}"

    # Extract last segment
    local suffix="${name##*$delimiter}"

    # If no delimiter found, suffix = name (no suffix)
    if [[ "$suffix" == "$name" ]]; then
        echo ""
        return
    fi

    # Security: validate
    if ! validate_category "$suffix" 2>/dev/null; then
        echo "uncategorized"
        return
    fi

    echo "$suffix"
}
```

**Store as attributes:**

```zsh
# In rses_scan_project()
RSES_PROJECT_ATTRS["$path:prefix"]=$(rses_extract_prefix "$name")
RSES_PROJECT_ATTRS["$path:suffix"]=$(rses_extract_suffix "$name")
```

**Effort:** ~50 lines, 20 tests
**Risk:** Low (additive change)

### Phase 3: Config Extension

**Goal:** Add [defaults] and [overrides] sections

```zsh
# New parser sections in lib/rses/parser.zsh

# Parse defaults
rses_parse_defaults() {
    RSES_AUTO_TOPIC="${RSES_DEFAULTS[auto_topic]:-false}"
    RSES_AUTO_TYPE="${RSES_DEFAULTS[auto_type]:-false}"
    RSES_DELIMITER="${RSES_DEFAULTS[delimiter]:--}"
}

# Parse overrides
rses_parse_overrides() {
    # RSES_TOPIC_OVERRIDES[prefix]=category
    # RSES_TYPE_OVERRIDES[suffix]=category
}
```

**Effort:** ~100 lines, 30 tests
**Risk:** Medium (config format change, backward compatible)

### Phase 4: Linker Enhancement

**Goal:** Generate auto-rules from extracted attributes

```zsh
# In lib/rses/linker.zsh

rses_generate_auto_rules() {
    local rule_type="$1"  # "topic" or "type"

    for project in "${RSES_UNIVERSE[@]}"; do
        local attr_key
        case "$rule_type" in
            topic) attr_key="prefix" ;;
            type) attr_key="suffix" ;;
        esac

        local extracted="${RSES_PROJECT_ATTRS[$project:$attr_key]}"
        [[ -z "$extracted" ]] && continue

        # Check override table
        local category
        case "$rule_type" in
            topic) category="${RSES_TOPIC_OVERRIDES[$extracted]:-$extracted}" ;;
            type) category="${RSES_TYPE_OVERRIDES[$extracted]:-$extracted}" ;;
        esac

        # Generate link
        local link_path=$(rses_generate_link_path "$project" "$category" "$rule_type")
        RSES_AUTO_LINKS+=("$project:$link_path")
    done
}
```

**Effort:** ~80 lines, 25 tests
**Risk:** Medium (behavior change, opt-in via config)

---

## Configuration Reference

### [defaults] Section

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `auto_topic` | `false\|prefix\|pattern` | `false` | Auto-derive topic categories |
| `auto_type` | `false\|suffix\|pattern` | `false` | Auto-derive type categories |
| `delimiter` | string | `-` | Segment delimiter for extraction |
| `fallback` | string | `uncategorized` | Category for unmatched projects |

### [overrides.topic] Section

```ini
[overrides.topic]
# Format: extracted_prefix = target_category
util = tools-and-utilities
viz = visualizations
visual = visualizations
sacred-geo = sacred-geometry
web = web-apps
webapp = web-apps
```

### [overrides.type] Section

```ini
[overrides.type]
# Format: extracted_suffix = target_category
lib = library
viz = visualization
visual = visualization
edu = educational
```

---

## Rule Resolution Order

```
1. EXPLICIT RULES
   [rules.topic], [rules.type]
   - Take absolute precedence
   - Used for set expressions: $claude & $quantum -> special

2. OVERRIDE MAPPINGS
   [overrides.topic], [overrides.type]
   - Applied to auto-extracted values
   - util -> tools-and-utilities

3. AUTO-DERIVED
   Extracted prefix/suffix used directly as category
   - quantum -> quantum
   - framework -> framework

4. FALLBACK
   [defaults] fallback value
   - uncategorized
```

---

## Security Considerations

### Validated Extraction

All extracted values MUST pass `validate_category()`:

```zsh
validate_category() {
    local category="$1"

    # No empty
    [[ -z "$category" ]] && return 1

    # No path traversal
    [[ "$category" == *..* ]] && return 1

    # No absolute paths
    [[ "$category" == /* ]] && return 1

    # Character whitelist
    [[ ! "$category" =~ ^[a-z0-9_-]+$ ]] && return 1

    # Length limit
    [[ ${#category} -gt 50 ]] && return 1

    return 0
}
```

### Rate Limiting

Maximum auto-created categories per run:

```zsh
RSES_MAX_AUTO_CATEGORIES=100

rses_create_auto_category() {
    if [[ ${#RSES_AUTO_CATEGORIES[@]} -ge $RSES_MAX_AUTO_CATEGORIES ]]; then
        RSES_LINK_ERRORS+="Max auto-categories reached"$'\n'
        return 1
    fi
    # ...
}
```

### Audit Logging

All auto-created directories logged:

```zsh
audit_log "AUTO_CATEGORY_CREATED" "$category (from prefix: $prefix)"
```

---

## Migration Path

### For Existing Users

```ini
# Current config continues to work unchanged
[sets]
quantum = quantum-*

[rules.topic]
$quantum -> quantum

# Gradually adopt auto mode:
# 1. Add [defaults] section
# 2. Enable auto_topic = prefix
# 3. Remove redundant explicit rules
# 4. Keep only overrides and set expressions
```

### For New Installations

```ini
# Minimal config with auto mode
[defaults]
auto_topic = prefix
auto_type = suffix

[overrides.topic]
util = tools-and-utilities
viz = visualizations

# Set algebra for advanced queries
[sets]
claude = {source = claude}

[sets.compound]
claude-quantum = {prefix = quantum} & $claude
```

---

## Compatibility Matrix

| Feature | Phase 1 | Phase 2 | Phase 3 |
|---------|---------|---------|---------|
| Explicit [sets] | Yes | Yes | Yes |
| Explicit [rules.*] | Yes | Yes | Yes |
| Prefix/suffix attributes | No | Yes | Yes |
| {prefix = X} filters | No | Yes | Yes |
| [defaults] section | No | No | Yes |
| [overrides.*] sections | No | No | Yes |
| Auto-category creation | No | No | Yes |

---

## Test Strategy

### Phase 2 Tests

```zsh
test_extract_prefix_simple() {
    assertEquals "quantum" $(rses_extract_prefix "quantum-viz")
}

test_extract_prefix_multi_segment() {
    assertEquals "quantum" $(rses_extract_prefix "quantum-wave-function")
}

test_extract_suffix_simple() {
    assertEquals "lib" $(rses_extract_suffix "my-lib")
}

test_extract_suffix_none() {
    assertEquals "" $(rses_extract_suffix "standalone")
}

test_extract_security_traversal() {
    assertEquals "uncategorized" $(rses_extract_prefix "../../../etc-passwd")
}
```

### Phase 3 Tests

```zsh
test_auto_topic_identity() {
    # quantum-viz -> by-topic/quantum/
    rses_link_init "$CONFIG_WITH_AUTO" "$TEST_DIR"
    assertContains "$RSES_PROPOSED_LINKS" "by-topic/quantum"
}

test_auto_topic_override() {
    # util-parser -> by-topic/tools-and-utilities/
    rses_link_init "$CONFIG_WITH_OVERRIDE" "$TEST_DIR"
    assertContains "$RSES_PROPOSED_LINKS" "by-topic/tools-and-utilities"
}

test_explicit_overrides_auto() {
    # Explicit rule takes precedence
    rses_link_init "$CONFIG_MIXED" "$TEST_DIR"
    # Check explicit rule applied, not auto
}
```

---

## Success Criteria

| Requirement | Target | Verification |
|-------------|--------|--------------|
| Backward compatibility | 100% | Existing configs work unchanged |
| Auto-extraction accuracy | 100% | Prefix/suffix correctly extracted |
| Override application | 100% | Overrides take precedence |
| Security validation | 100% | Invalid values rejected |
| Performance | <1s for 1000 projects | Benchmark |
| Test coverage | 250+ tests | Test suite |

---

## Timeline

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Explicit mappings | COMPLETE |
| Phase 2 | Scanner enhancement | 1 session |
| Phase 3 | Config extension | 1-2 sessions |
| Phase 4 | Linker enhancement | 1 session |
| Phase 5 | Documentation + polish | 1 session |

**Total:** 4-5 sessions for complete hybrid implementation

---

## References

- RSES-ARCHITECTURE.md - Formal specification
- CONFIG_SCHEMA.md - Config format documentation
- lib/rses/*.zsh - Implementation
- lib/rses/tests/*.zsh - Test suites
