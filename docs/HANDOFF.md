# HANDOFF: stan projektu do przeniesienia

> Stan na **sob 14.11.2026, ~10:00 CET** (dzień 1 hackathonu).
> **Deadline LOKALNY: nd 15.11.2026, 12:59 CET** ⚠️ (ocena lokalna o 13:00). Globalny: nd 23:59 CET.
> Pełny harmonogram Rzeszowa i plan nagrania: [DEMO-PLAN.md](DEMO-PLAN.md). Praca równoległa agentów: [COORDINATION.md](COORDINATION.md).
> Ten plik to punkt startowy dla nowego czatu / nowej maszyny. Zacznij od sekcji 1 i 2.

---

## 1. Co to jest

Zespół z Rzeszowa robi wyzwanie **[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)** (NASA Space Apps 2026).
Narzędzie pokazuje **pozycję Słońca i Ziemi względem horyzontu** w miejscu lądowania na Księżycu (głównie biegun południowy) dla wybranej daty, z tego **zasilanie** (Słońce) i **okna łączności DTE** (Ziemia), oraz pozwala szybko **porównać miejsca i daty** (np. „slip +7 dni”).

- Repo: **https://github.com/jedynatv1-cell/space-apps-rzeszow** (prywatne, gałąź `main`). **Przed zgłoszeniem zmienić na publiczne.**
- Stack: **Rust** (axum + ANISE) jako backend liczący, statyczny frontend HTML/JS w `web/`.
- Oficjalny tekst wyzwania: [CHALLENGE-OFFICIAL.md](CHALLENGE-OFFICIAL.md), nasze podsumowanie: [CHALLENGE.md](CHALLENGE.md).
- Pełny research (API, dane, fizyka, MVP, podział zadań): [RESEARCH.md](RESEARCH.md).
- Zasady zgłoszenia (zweryfikowane z oficjalnego przewodnika): [SUBMISSION.md](SUBMISSION.md).

## 2. Przeniesienie projektu: co jest w gicie, a co NIE

### W gicie (wystarczy `git clone`)
Kod (`src/`, `web/`), `Cargo.toml`/`Cargo.lock`, `data/sites.json`, cała dokumentacja (`docs/`), CI (`.github/workflows/ci.yml`), `.claude/launch.json`, `CLAUDE.md`.

```bash
gh repo clone jedynatv1-cell/space-apps-rzeszow
```

### POZA gitem: trzeba skopiować ręcznie albo pobrać ponownie (`data/raw/` jest w `.gitignore`)

| Plik | Rozmiar (B) | Skąd |
|---|---|---|
| `data/raw/kernels/de440s.bsp` | 32 726 016 | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp |
| `data/raw/kernels/moon_pa_de440_200625.bpc` | 12 863 488 | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc |
| `data/raw/kernels/moon_fk_de440.epa` | 286 | http://public-data.nyxspace.com/anise/v0.7/moon_fk_de440.epa |
| `data/raw/dem/ldem_80s_40m.img` | **462 080 000** ✅ | `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_40m.img` |
| `data/raw/dem/ldem_80s_40m.lbl` | 4 991 | ta sama ścieżka, `.lbl` |
| `data/raw/dem/ldem_75s_120m.img` | **116 250 752** ✅ | ta sama ścieżka, `ldem_75s_120m.img` (7624 × 7624, 120 m/pix) |
| `data/raw/dem/ldem_75s_120m.lbl` | 4 991 | jw. |

Bez kerneli serwer **nie wystartuje** (czytelny błąd z listą plików). Bez DEM wszystko działa, tylko horyzont jest sferyczny.

Pobranie jednym poleceniem (Git Bash):

```bash
mkdir -p data/raw/kernels data/raw/dem
cd data/raw/kernels
curl -fLO https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
curl -fLO https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc
curl -fLO http://public-data.nyxspace.com/anise/v0.7/moon_fk_de440.epa
cd ../dem
B=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
for f in ldem_80s_40m ldem_75s_120m; do curl -fLO $B/$f.lbl; curl -fL -C - -O $B/$f.img; done
ls -l   # porównaj rozmiary z tabelą
```

### Czego NIE kopiować
- `target/`: artefakty kompilacji (GB), odtworzą się same.
- `space-apps-rzeszow/`: przypadkowy, zbędny klon tego samego repo leżący w folderze projektu (nieśledzony). Można go skasować.

### Wymagane narzędzia na nowej maszynie
Git, Rust stable (MSVC na Windows + VS Build Tools C++), opcjonalnie Node LTS, Python 3, GitHub CLI. Instrukcja: [SETUP.md](SETUP.md).
Wersje użyte tutaj: rustc 1.99.1, git 2.56, Node 26.13.1, Python 3.15.2, gh 2.103.3.

## 3. Uruchomienie

```bash
cargo run            # http://localhost:3000
cargo test           # 10 testów; test vs Horizons pomija się (SKIP), jeśli brak kerneli
cargo fmt && cargo clippy --all-targets -- -D warnings
```

Pierwsza kompilacja trwa ok. 3–4 min (anise, nalgebra, axum). Zależności są w dev kompilowane z `opt-level = 2` (`Cargo.toml`), żeby pętle efemeryd były szybkie.

## 4. Co jest zrobione (✅ = sprawdzone)

| Element | Stan |
|---|---|
| Środowisko, repo, CI (fmt/clippy/test na push i PR) | ✅ |
| Research (8 sekcji) + `data/sites.json` (29 miejsc, 12 przy biegunie płd.) | ✅ ze zweryfikowanymi kluczowymi liczbami |
| `src/ephem.rs`: Słońce/Ziemia az/el z ANISE | ✅ **zgodne z JPL Horizons do 0,001°** (test `matches_horizons_shackleton`) |
| `src/horizon.rs`: horyzont sferyczny (z obniżeniem dla masztu), ułamek widocznej tarczy | ✅ testy |
| Maska horyzontu z terenu | ✅ `horizon::from_dem` (720 az × 0,5°, ray-march z krzywizną, cache per miejsce), w `/api/track` (PR #10). Walidacja: Connecting Ridge (Gläser 2014) 91,1% vs 92% i 95,7% vs 95,6% czasu w świetle. Pierwsze zapytanie dla miejsca ~3,5 s |
| `src/metrics.rs`: próbkowanie, okna Słońca i DTE, sunset/Earthset, najdłuższa noc | ✅ testy + sprawdzenie w przeglądarce |
| `src/api.rs`: `/api/health`, `/api/sites`, `/api/track` | ✅ ręcznie: 400 dla złych danych, limit 20 000 punktów |
| `web/index.html`: wybór miejsca, wykres elewacji, karty metryk, slip +1/+7/+30 d | ✅ działa (szkic UI) |
| `src/dem.rs`: czytnik LOLA DEM | ✅ na `main` (etykieta z `.lbl`, mmap, interpolacja dwuliniowa; orientacja: Shackleton = dołek 4 km, Malapert = szczyt 4,9 km). Maska horyzontu: następny krok, L2 |
| Maska horyzontu z terenu | ❌ następny krok |

Weryfikacja na żywo (14.11):
- **Shackleton** (−89,45; −129,78): maks. elewacja Ziemi 5,927° 24.11 02:00 UTC (Horizons 5,926° o 00:00).
- **Apollo 11**: Ziemia 100% czasu, Słońce ~50%, najdłuższa noc 338 h.

### Commity
```
2c76890 Add app scaffold: ANISE ephemeris, track API and minimal web UI
3d6ead7 Add pre-hackathon research, landing sites and official challenge text
9eb6cba Document chosen challenge: Lunar Landing Site Navigator
8b57167 Add CI workflow and line-ending rules
ac97a80 Initial project setup for Space Apps Rzeszow
```
CI ✅ zielone dla `2f48e76` (szkielet + dokumentacja): fmt, clippy, testy. Test vs Horizons w CI się pomija (brak kerneli na runnerze); lokalnie przechodzi. Uwaga: GitHub ostrzega, że `actions/checkout@v4` działa na wycofywanym Node 20. Na razie działa, później można podbić wersję. Stan: `gh run list --limit 3`.

## 5. Architektura i kontrakt API

```
data/raw/kernels ─▶ ephem (ANISE) ─┐
data/raw/dem ─────▶ dem ─▶ horizon ┼─▶ metrics ─▶ api (axum) ─▶ web/ (fetch JSON)
data/sites.json ──────────────────────────────────┘
```

`GET /api/track?lat=&lon=&start=&days=30&step_min=60&alt_m=0&dte_margin_deg=0`
- `start`: `2026-11-14`, `2026-11-14T06:30` lub `2026-11-14T06:30:00Z` (UTC).
- limity: `step_min >= 1`, `0 < days <= 400`, max 20 000 punktów.
- odpowiedź: `{ site, horizon: {az_step_deg, elev_deg[720], source: "sphere" | "lola:<produkt>", ground_m?}, summary: {...}, points: [{t, sun:{az_deg,el_deg,radius_deg,distance_km}, earth:{...}, sun_horizon_deg, earth_horizon_deg, sun_vis, earth_vis}] }`
- `horizon.ground_m`: wysokość terenu pod obserwatorem (m względem sfery 1737,4 km), tylko dla maski z terenu; obserwator stoi `alt_m` nad gruntem.
- `summary`: `sun_mean_fraction, sun_visible_pct, earth_visible_pct, longest_night_hours, longest_dte_gap_hours, next_sunset, next_earthset, hours_to_sunset, hours_to_earthset, sunlight_windows[], dte_windows[]`.

Konwencje: długość **wschodnia** −180..180; elewacja względem płaszczyzny stycznej do **sfery 1737,4 km** (jak Horizons); azymut od północy zgodnie z ruchem wskazówek zegara.

## 6. Następne kroki (priorytet)

1. **[B] Czytnik DEM + maska horyzontu**. To nasz główny wyróżnik; bez tego Shackleton pokazuje „100% Słońca”.
   - Parametry z `ldem_80s_40m.lbl` (✅ odczytane): `LINES = LINE_SAMPLES = 15200`, `LSB_INTEGER`, 16 bit, `SCALING_FACTOR = 0.5`, `OFFSET = 1737400.` (wysokość [m] = DN × 0,5 względem 1737,4 km), `POLAR STEREOGRAPHIC`, `CENTER_LATITUDE = -90`, `CENTER_LONGITUDE = 0`, `MAP_SCALE = 40 m/pix`, `LINE_PROJECTION_OFFSET = SAMPLE_PROJECTION_OFFSET = 7599.5`, `A_AXIS_RADIUS = 1737.4 km`.
   - Wzory projekcji: RESEARCH.md sekcja 3. **Najpierw test orientacji**: Shackleton (−89,67°, 129,2°E) musi wyjść jako głęboki dołek. Znaki we wzorach PDS mogą być niespójne.
   - Maska: dla każdego azymutu (720 × 0,5°) ray-march po DEM, z poprawką na krzywiznę: max elewacji punktu terenu względem obserwatora. Podłączyć w `api::compute_track` zamiast `HorizonMask::sphere` (oznaczone `TODO(B)`), z cache per miejsce.
   - Crate'y do dodania: `memmap2`, `rayon`.
2. **[A/C] Walidacja**: porównać nasz procent oświetlenia z mapami PGDA (Mazarico et al.) dla 3–4 miejsc; strona/tabelka „Validation” do pitchu (kryterium *Validity*).
3. **[D] Frontend**: polarny sky-plot (horyzont + Słońce + Ziemia do skali), panorama 360°, oś czasu z odtwarzaniem, **porównanie 2–3 miejsc obok siebie**, tryb ekspert/publiczny. Teraz jest tylko szkic.
4. **[C] Metryki**: `hours_to_earthset` liczy pierwszy zachód **po pierwszym wschodzie**; jeśli Ziemia jest pod horyzontem na starcie, warto pokazać też „czas do Earthrise”. Analogicznie dla Słońca.
5. **[E] Zgłoszenie**: strona projektu otwarta od 14.11 9:00; demo **≤ 30 s wideo lub ≤ 7 slajdów** (po angielsku); sekcja Use of SI; repo publiczne; zaprosić zespół do repo (`gh api -X PUT repos/jedynatv1-cell/space-apps-rzeszow/collaborators/LOGIN -f permission=push`).

Kamienie milowe: sob 17:00 koniec dnia na miejscu (pracujemy dalej zdalnie), sob 20:00 maska horyzontu na wykresie, **nd 10:00 feature freeze**, 10:00–12:40 nagranie i strona projektu, **12:40 Submit** (lokalny deadline 12:59). Szczegóły: [DEMO-PLAN.md §4](DEMO-PLAN.md).

## 7. Pułapki, na które już trafiliśmy

- **ANISE:** ramka `MOON_ME_FRAME` (31001) **nie działa** z tym zestawem kerneli. Używać `MOON_ME_DE440_ME421_FRAME`.
- **Horizons** nie uwzględnia terenu (elewacja względem sfery), limit 90 000 kroków na zapytanie, błędy wracają jako HTTP 200 z tekstem (szukać `$$SOE`).
- **spaceappschallenge.org** renderuje się w JS: `curl`/WebFetch zwracają pustą stronę albo błąd TLS. Czytać w przeglądarce.
- **Windows:** nowo zainstalowane `node`/`gh` działają dopiero w **nowym** terminalu. PowerShell 5.1 opakowuje stderr natywnych programów jako „błąd” mimo sukcesu (np. `cargo build`).
- **Regiony Artemis** w `sites.json` mają współrzędne **proxy**. Pary *Mons Mouton* / *Mons Mouton Plateau* i *Nobile Rim 1* / *2* są już rozsunięte (L4, PR #3): środki mozaik LROC, zachodni brzeg krateru Nobile, punkt z arXiv:2406.19863. Źródła są w `coord_note`.
- Według nasa.gov pierwsze lądowanie załogowe to teraz **Artemis IV (2028)**; Artemis III to test na LEO.
- `.gitattributes` wymusza LF; ostrzeżenia o CRLF na Windows są nieszkodliwe.

## 8. Rzeczy niezweryfikowane
Pełna lista na końcu [RESEARCH.md](RESEARCH.md). Najważniejsze: współrzędne regionów Artemis, znaki we wzorach projekcji PDS, wydajność maski horyzontu (bez benchmarku), plany misji 2026/27.
