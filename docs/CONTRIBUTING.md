# Jak pracujemy (Git workflow)

Na hackathonie liczy się tempo, ale bez zasad po 20 godzinach mamy konflikty i zepsuty `main`.
Te reguły są celowo minimalne.

## Gałęzie

- `main` — zawsze się kompiluje i da się z niego zrobić demo.
- Każde zadanie na własnej gałęzi: `imie/krotki-opis`, np. `jacek/nasa-api-client`.

```bash
git switch main
git pull
git switch -c jacek/nasa-api-client
```

## Commity

- Małe i często (co 30–60 min pracy).
- Opis w trybie rozkazującym, po angielsku: `Add NASA API client`, `Fix CSV parsing for empty rows`.
- Nie commitujemy: kluczy API, `.env`, dużych danych (`data/raw/`), katalogu `target/`.

## Przed pushem

```bash
cargo fmt
cargo clippy -- -D warnings
cargo test
```

## Pull Requesty

```bash
git push -u origin HEAD
gh pr create --fill
```

- Ktoś z zespołu rzuca okiem (wystarczy 5 minut) i merguje.
- Konflikty rozwiązuje autor PR-a.
- W ostatnich 2 godzinach przed deadlinem: **tylko poprawki**, żadnych nowych funkcji.

## Podział pracy

Zadania trzymamy w GitHub Issues (`gh issue create`) — jedno zadanie = jedna osoba = jedna gałąź.
Jeśli coś blokuje Cię dłużej niż 30 minut — mów od razu.
