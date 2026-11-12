# NASA Space Apps Challenge — Rzeszów

Team project for the Space Apps hackathon in Rzeszów.

## Layout

| Path       | Purpose                                   |
|------------|-------------------------------------------|
| `src/`     | Rust code (`cargo run`)                   |
| `data/`    | Small datasets (raw downloads go in `data/raw/`, git-ignored) |
| `scripts/` | Helper scripts (Python / Node)            |
| `docs/`    | Notes, pitch, diagrams                    |

## Quick start

```bash
cargo run
cargo clippy
cargo fmt
```

## Docs

- [SETUP.md](docs/SETUP.md) — install the toolchain from scratch
- [CONTRIBUTING.md](docs/CONTRIBUTING.md) — branches, commits, PRs
- [CHALLENGE.md](docs/CHALLENGE.md) — chosen challenge, datasets, MVP scope
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, stack, decisions
- [SUBMISSION.md](docs/SUBMISSION.md) — submission checklist and pitch plan

## Toolchain

Git, Rust (stable, MSVC) + clippy/rustfmt/rust-analyzer, Node.js LTS, Python 3, GitHub CLI.
