# RSES-Playground

A web-based development workbench for the **Rule-based Symlink Engine System (RSES)** - a configuration-driven framework for organizing AI-generated projects using symbolic links and multi-dimensional categorization.

## Overview

RSES-Playground provides an interactive environment for designing, validating, testing, and previewing RSES configurations before deploying them to organize your project directory.

```
~/Projects/
├── by-ai/          # Source of truth (physical files)
│   ├── claude/
│   ├── chatgpt/
│   └── gemini/
├── by-topic/       # View layer (symlinks by topic)
│   ├── quantum/
│   ├── web-apps/
│   └── tools/
├── by-type/        # View layer (symlinks by type)
│   ├── framework/
│   ├── library/
│   └── cli-tool/
└── by-filetype/    # View layer (symlinks by extension)
```

## Features

### Current (v1.0)
- **Configuration Editor** - Edit RSES configs with real-time validation
- **Match Testing** - Test filenames against rules to see categorization
- **Symlink Preview** - Preview what symlinks would be created
- **Workbench** - Interactive testing with expression evaluation

### Planned (v2.0) - See [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)
- Real-time file watching with WebSocket updates
- Actual symlink execution (not just preview)
- Unknown category prompting with learning
- Dashboard with statistics
- Monaco editor with RSES syntax highlighting

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Express.js 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Real-time | WebSocket (planned) |

## Quick Start

```bash
# Install dependencies
npm install

# Set up database
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rses_playground"
npm run db:push

# Start development server
npm run dev
```

Visit `http://localhost:5000`

## RSES Configuration Format

```ini
[defaults]
auto_topic = prefix
auto_type = suffix
delimiter = -

[sets]
quantum = quantum-*
web = web-* | webapp-*
tools = tool-*

[sets.attributes]
claude = {source = claude}

[sets.compound]
claude-quantum = $quantum & $claude

[rules.topic]
$quantum -> quantum
$tools -> tools-and-utilities
{source = *} -> ai/$source

[rules.type]
*-app -> application
*-lib -> library
```

## Project Structure

```
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components
│       ├── hooks/          # React hooks
│       └── pages/          # Page components
├── server/                 # Express backend
│   ├── lib/rses.ts        # RSES parser engine
│   └── routes.ts          # API endpoints
├── shared/                 # Shared types
├── .claude/               # Context survival files
│   ├── PROJECT-STATE.json # Implementation state
│   └── RESUME-PROMPT.md   # Context recovery
└── IMPLEMENTATION-PLAN.md # 7-phase development plan
```

## Implementation Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Security Hardening | 🔲 Not Started |
| 2 | Core Engine Improvements | 🔲 Not Started |
| 3 | File System Integration | 🔲 Not Started |
| 4 | UI/UX Improvements | 🔲 Not Started |
| 5 | Prompting & Learning | 🔲 Not Started |
| 6 | CMS Features | 🔲 Not Started |
| 7 | Production Readiness | 🔲 Not Started |

See [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) for full details.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/configs` | List all configurations |
| POST | `/api/configs` | Create configuration |
| PUT | `/api/configs/:id` | Update configuration |
| DELETE | `/api/configs/:id` | Delete configuration |
| POST | `/api/engine/validate` | Validate config syntax |
| POST | `/api/engine/test` | Test filename matching |
| POST | `/api/engine/preview` | Preview symlink generation |

## Development

```bash
# Type checking
npm run check

# Database migrations
npm run db:push

# Build for production
npm run build
```

## License

MIT

---

*Built with [Claude Code](https://claude.ai/code)*
