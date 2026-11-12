# Architektura

> Szkic — aktualizujemy, gdy decyzje zapadną.

## Przegląd

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Źródła danych│ ──▶ │  Rust (backend /  │ ──▶ │  Prezentacja │
│  NASA API,    │     │  przetwarzanie)   │     │  CLI / web   │
│  pliki CSV    │     │                   │     │              │
└──────────────┘     └──────────────────┘     └──────────────┘
```

## Struktura repo

| Ścieżka | Zawartość |
|---|---|
| `src/main.rs` | Punkt wejścia |
| `src/` | Moduły Rusta (dodawać jako `src/<moduł>.rs`) |
| `data/` | Małe zbiory danych w repo; duże w `data/raw/` (ignorowane przez git) |
| `scripts/` | Skrypty pomocnicze — pobieranie/czyszczenie danych (Python/Node) |
| `docs/` | Dokumentacja |

## Proponowany stos

| Warstwa | Kandydaci | Uwagi |
|---|---|---|
| HTTP klient | `reqwest` + `tokio` | do NASA API |
| Serializacja | `serde`, `serde_json`, `csv` | |
| Serwer web (jeśli potrzebny) | `axum` | prosty, async |
| Frontend (jeśli potrzebny) | statyczny HTML + JS / Vite | Node już zainstalowany |
| Wykresy / mapy | Leaflet, Chart.js | po stronie przeglądarki |
| Konfiguracja | `dotenvy` | wczytanie `.env` |

## Decyzje (ADR-lite)

Każdą ważną decyzję dopisujemy tutaj, krótko:

| # | Decyzja | Dlaczego | Data |
|---|---|---|---|
| 1 | Backend w Ruście | Zespół chce się go uczyć; szybkie przetwarzanie danych | 2026-11-12 |

## Zmienne środowiskowe

Trzymane w `.env` (nie commitujemy). Wzór w `.env.example`:

```
NASA_API_KEY=DEMO_KEY
```
