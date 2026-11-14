# Start na każdym komputerze (5 minut)

## Kroki (każdy laptop)

1. Zainstaluj i zaloguj: **Git**, **Node LTS**, **GitHub CLI** (`gh auth login`), **Claude** (to samo konto zespołu). Mocne laptopy (L1, L2, L6) dodatkowo **Rust** (instrukcja w [SETUP.md](SETUP.md)).
2. Sklonuj repo:
   ```bash
   gh repo clone jedynatv1-cell/space-apps-rzeszow navigator
   ```
3. W Claude: **nowy czat Code w folderze `navigator`**. Od razu zmień jego nazwę według tabeli niżej (pasek boczny → ⋯ przy czacie → *Rename*).
4. Wklej **prompt startowy** dla swojego ID (niżej). Hook na starcie sesji sam doda resztę kontekstu: rolę, pliki, stan gita i Dziennik.
5. Włącz **Remote Control** w tym czacie (skill `/setup-laptop` też to zaproponuje).

## ID, nazwy czatów i prompty

| ID | Maszyna | Nazwa czatu |
|---|---|---|
| L1 | 💪 | `L1 · koordynator` |
| L2 | 💪 | `L2 · teren + metryki` |
| L3 | 🪶 | `L3 · frontend` (to jest Antigravity, nie Claude) |
| L4 | 🪶 | `L4 · treści` |
| L5 | 🪶 | `L5 · QA` |
| L6 | 💪 (od nd) | `L6 · demo` |
| R1 | — | nie dotykać (trening PPO) |

**L1**
```
Jestem L1, KOORDYNATOR. Uruchom /setup-laptop z ID L1, potem /sync i serwer cargo run. Nie piszesz kodu funkcji: ten czat służy tylko komunikacji między botami (ListAgents, SendMessage), prowadzeniu Dziennika i HANDOFF, przydziałowi pracy i merge PR-ów, które aktualizują dokumenty. Odpowiadaj krótko.
```

**L2**
```
Jestem L2 (mocny). Uruchom /setup-laptop z ID L2, potem /sync. Najpierw W1: git switch feat/terrain, czytnik DEM jest gotowy (src/dem.rs), zrób horizon::from_dem (HANDOFF §6 pkt 1) i podłącz w api.rs. Potem W2: earthrise/sunrise i /api/compare. Zgłaszaj się do L1 przy starcie, blokadzie i /ship; dokumenty aktualizuj w tym samym PR. Odpowiadaj krótko.
```

**L3 (Antigravity)**: pierwsza wiadomość w Antigravity, w folderze `navigator`, na gałęzi `feat/ui`:
```
Read AGENTS.md, CLAUDE.md and docs/COORDINATION.md. You are laptop L3 and own only web/**. Backend runs on L1: http://<IP-L1>:3000 (API in docs/HANDOFF.md §5). Build: polar sky plot with horizon, Sun and Earth; timeline; side-by-side compare of 2-3 sites. Commit to feat/ui, open PRs, never push to main.
```

**L4**
```
Jestem L4 (słaby, bez Rusta). Uruchom /setup-laptop z ID L4, potem /sync. Potem W4: w data/sites.json rozsuń pary regionów Artemis o identycznych współrzędnych (Mons Mouton, Nobile Rim) i przygotuj po angielsku teksty strony projektu wg SUBMISSION.md. Nie kompiluj. Odpowiadaj krótko.
```

**L5**
```
Jestem L5 (słaby, QA). Uruchom /setup-laptop z ID L5. Nie edytuj kodu. Pomagaj mi testować aplikację na http://<IP-L1>:3000 i zapisuj znalezione błędy jako wiersze w Dzienniku (COORDINATION.md §9). Odpowiadaj krótko.
```

**L6 (niedziela)**
```
Jestem L6 (mocny, demo). Uruchom /setup-laptop z ID L6, potem /sync. Potem W5 wg docs/DEMO-PLAN.md: skrypt Playwright nagrywający sceny + captions.srt + timeline.fcpxml do DaVinci. Tylko ekran, bez twarzy i głosów osób poniżej 18 lat. Odpowiadaj krótko.
```

## Sieć: czy potrzebny Tailscale?

**Nie, jeśli to zadziała:**
1. Na L1: `ipconfig` (Windows) → zapisz **IPv4**, np. `192.168.1.23`. Uruchom `cargo run` i zezwól na połączenie w zaporze Windows.
2. Na innym laptopie otwórz `http://192.168.1.23:3000`.
3. Jeśli strona się otwiera, Tailscale nie jest potrzebny. Wpisz ten adres zamiast `<IP-L1>`.

**Jeśli się nie otwiera** (Wi-Fi izoluje urządzenia): wtedy Tailscale ([COORDINATION.md §7](COORDINATION.md)), ok. 5 minut na laptop. Druga opcja dla L3: frontend na zapisanych odpowiedziach JSON z L1, bez połączenia na żywo.

GitHub, Claude, Remote Control i wiadomości między agentami działają przez internet, więc **Tailscale ich nie dotyczy**.
