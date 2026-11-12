# Setup środowiska

Instrukcja dla każdego członka zespołu — od zera do `cargo run` w ~15 minut (Windows).

## 1. Narzędzia

Zainstaluj przez `winget` (PowerShell):

```powershell
winget install --id Git.Git -e
winget install --id Rustlang.Rustup -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.13 -e
winget install --id GitHub.cli -e
```

Rust na Windows potrzebuje linkera MSVC — zainstaluj **Visual Studio Build Tools** z komponentem
*„Programowanie aplikacji klasycznych w języku C++”* (albo pełne Visual Studio Community).

Po instalacji **otwórz nowy terminal**, żeby PATH się odświeżył.

## 2. Komponenty Rusta

```powershell
rustup default stable
rustup component add clippy rustfmt rust-analyzer
```

## 3. GitHub i Git

```powershell
gh auth login --web --git-protocol https
git config --global user.name  "Imię Nazwisko"
git config --global user.email "twoj-email-z-githuba"
```

## 4. Repozytorium

```powershell
gh repo clone <organizacja>/<repo>
cd <repo>
cargo build
cargo run
```

## 5. Edytor

VS Code zaproponuje rozszerzenia z `.vscode/extensions.json` (rust-analyzer, TOML, debugger LLDB) — kliknij *Install All*.

## Weryfikacja

```powershell
git --version; rustc --version; cargo --version; node --version; python --version; gh --version
```

Jeśli wszystko wypisuje wersje — jesteś gotowy.

## Typowe problemy

| Problem | Rozwiązanie |
|---|---|
| `link.exe not found` | Brak MSVC Build Tools — patrz pkt 1 |
| `node`/`gh` nie jest rozpoznawane | Otwórz nowy terminal / zrestartuj VS Code |
| `git push` pyta o hasło | `gh auth setup-git` |
| rust-analyzer nie działa | Otwórz w VS Code folder z `Cargo.toml`, nie folder nadrzędny |
