# Jak pracują razem 2 czaty Claude + Antigravity

**Zasada:** agenci nie rozmawiają ze sobą bezpośrednio. Koordynują się przez **jedno repo na GitHubie**, w którym:
- każdy agent ma **własną gałąź** i **własne pliki**, nigdy nie edytują tych samych plików jednocześnie;
- stan wspólny jest w **plikach w repo** (ten plik, `docs/HANDOFF.md`, `CLAUDE.md`, `AGENTS.md`), nie w pamięci czatu;
- do `main` wchodzi się tylko przez **Pull Request z zielonym CI**.

```
            GitHub: main  (zawsze działa, CI zielone)
           ▲            ▲             ▲
        PR │         PR │          PR │
  feat/terrain     feat/metrics    feat/ui
  Claude czat 1    Claude czat 2   Antigravity
  src/dem.rs       src/metrics.rs  web/
  src/horizon.rs   src/api.rs
```

## 1. Podział: kto jest właścicielem jakich plików

| Agent | Gałąź | Pliki (tylko on je zmienia) | Zadanie |
|---|---|---|---|
| **Claude czat 1** | `feat/terrain` | `src/dem.rs`, `src/horizon.rs` | Czytnik LOLA DEM, maska horyzontu z terenu (HANDOFF §6 pkt 1) |
| **Claude czat 2** | `feat/metrics` | `src/metrics.rs`, `src/api.rs`, `src/ephem.rs` | Earthrise/sunrise, porównanie wielu miejsc (`/api/compare`), walidacja PGDA |
| **Antigravity** | `feat/ui` | `web/**` | Frontend: sky-plot, panorama, porównanie obok siebie, tryb public/ekspert |
| **Człowiek (E)** | `docs/pitch` | `docs/SUBMISSION.md`, `docs/DEMO-PLAN.md`, `data/sites.json` | Zgłoszenie, nagranie, slajdy |

Pliki **wspólne** (`Cargo.toml`, `src/main.rs`, `README.md`, `CLAUDE.md`) zmienia tylko jedna osoba naraz. Kto zmienia, ten wpisuje to w „Dzienniku” niżej.

### Kontrakt między agentami = API JSON
Antigravity (frontend) i Claude czat 2 (API) dogadują się **tylko przez kontrakt** z HANDOFF §5. Zmiana kształtu JSON-a to wpis w Dzienniku **przed** zmianą kodu. Nowe pola dodajemy; starych nie usuwamy ani nie zmieniamy im nazw.

## 2. Konfiguracja (raz, na nowej maszynie)

Każdy agent dostaje **osobny folder** (git worktree), żeby nie nadpisywać sobie plików na dysku:

```bash
git clone https://github.com/jedynatv1-cell/space-apps-rzeszow navigator
cd navigator
git worktree add ../nav-terrain -b feat/terrain
git worktree add ../nav-metrics -b feat/metrics
git worktree add ../nav-ui      -b feat/ui
```

Skopiuj `data/raw/` do każdego folderu albo podlinkuj (jeden egzemplarz zajmuje ~620 MB):

```powershell
# PowerShell jako administrator, z folderu nav-terrain (analogicznie w pozostałych)
New-Item -ItemType SymbolicLink -Path data\raw -Target ..\navigator\data\raw
```

- **Claude czat 1** otwórz w folderze `nav-terrain`, **czat 2** w `nav-metrics`, a **Antigravity** w `nav-ui`.
- Pierwsza wiadomość do każdego agenta (wklej):
  > Przeczytaj CLAUDE.md (albo AGENTS.md), docs/HANDOFF.md i docs/COORDINATION.md. Jesteś „<nazwa agenta>” z tabeli w COORDINATION.md: zmieniasz tylko swoje pliki, pracujesz na swojej gałęzi, a przed każdym commitem uruchamiasz fmt, clippy i testy. Na koniec każdej sesji dopisz wpis do Dziennika.
- Antigravity czyta `AGENTS.md` (wskazuje na `CLAUDE.md`). Jeśli go nie wczyta, wklej mu treść `CLAUDE.md` do pierwszej wiadomości.
- **Serwery deweloperskie na różnych portach**, żeby się nie gryzły: `PORT=3001 cargo run`, `PORT=3002 cargo run` itd. Frontend w `nav-ui` może celować w dowolny backend.

## 3. Rytm pracy (co ~1–2 h)

1. Agent kończy kawałek, lokalnie przechodzą `cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test`.
2. `git push` swojej gałęzi, potem `gh pr create --fill`.
3. Człowiek patrzy na diff (5 min) i robi merge, gdy CI jest zielone.
4. Pozostali agenci: `git pull --rebase origin main`, żeby dostać nowości.
5. Wpis do Dziennika.

**Ty jesteś routerem.** Gdy czat 1 skończy maskę horyzontu, mówisz czatowi 2 i Antigravity: „pull main, nowe pole `horizon.source = lola:…`”. Wiadomość między agentami to w praktyce **commit + wpis w Dzienniku + jedno zdanie od Ciebie**.

Jeśli oba czaty Claude są w aplikacji Claude desktop na tej samej maszynie, sesje mogą też wysyłać sobie wiadomości bezpośrednio (sesja uruchomiona z innej sesji widzi ją jako „linked session”). Repo i Dziennik i tak pozostają źródłem prawdy, bo Antigravity tego kanału nie widzi.

## 4. Dziennik (dopisuj na górze)

| Kiedy | Kto | Co | Wpływ na innych |
|---|---|---|---|
| sob 14.11 ~10:30 | Claude (czat 0) | Szkielet + dokumentacja, CI zielone, DEM pobrane | Start: każdy bierze swoją gałąź |
