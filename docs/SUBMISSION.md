# Zgłoszenie i pitch

Źródło (✅ sprawdzone 13.11.2026): [Project Submission Guide 2026](https://www.spaceappschallenge.org/resources/project-submission-guide/).
Szczegóły w [RESEARCH.md, sekcja 7](RESEARCH.md).

Jury ocenia głównie **stronę projektu na spaceappschallenge.org**. Wszystko na niej musi być **po angielsku**.

## Terminy (czas lokalny Rzeszów, CET)

| Kiedy | Co |
|---|---|
| sob 14.11, 9:00 | Otwiera się zakładka „Project” na stronie zespołu |
| nd 15.11, 10:00 | Feature freeze |
| nd 15.11, 12:40 | **Nasz** Submit (zapas przed lokalnym deadline'em) |
| **nd 15.11, 12:59** | **Deadline do oceny LOKALNEJ** (Rzeszów), ocena od 13:00, nagrody 16:00 |
| nd 15.11, 23:59 | Deadline do oceny GLOBALNEJ: „Submit for Judging” |

Harmonogram ze strony wydarzenia Rzeszów (✅ sprawdzony 14.11). Pełny plan dnia: [DEMO-PLAN.md](DEMO-PLAN.md).

## Checklista zgłoszenia

- [ ] Cały zespół potwierdzony na **tym samym** wydarzeniu lokalnym (Rzeszów)
- [ ] **Project Name**
- [ ] **High-Level Summary**: co zrobiliśmy, jak odpowiada na wyzwanie, dlaczego to ważne
- [ ] **Link to Project Demo**: **wideo ≤ 30 s** *albo* **≤ 7 slajdów** (z tytułowym i intro). Przekroczenie limitu wyklucza z Global Judging
- [ ] **Link to Final Project**: publiczne repo GitHub, czyli zmienić visibility na public
- [ ] **Detailed Description**: co robi, jak działa, korzyści, cele, narzędzia (Rust, anise, axum, …)
- [ ] **Use of SI**: gdzie i jak użyliśmy AI (kod, dokumentacja, research)
- [ ] **NASA Data**: JPL Horizons, LOLA (LRO), DE440 / NAIF SPICE, PGDA illumination maps
- [ ] **Space Agency Partner Data and Other References**: wszystkie biblioteki, dane, obrazy (m.in. JAXA SLIM, ISRO Chandrayaan-3 jako miejsca lądowania)
- [ ] Wszystkie linki otwierają się **bez logowania**: sprawdzić w oknie incognito
- [ ] Kliknięte **„Submit for Judging”**

## Zasady, o których łatwo zapomnieć

- AI wolno używać jako narzędzia, ale **nie do wymyślenia pomysłu**. Obrazy i wideo z AI muszą mieć znak wodny, a kod i dane z AI trzeba opisać.
- **Bez logo NASA**, flag i identyfikatorów misji w treściach generowanych przez AI.
- Wideo może być po polsku, ale **z angielskimi napisami**. Slajdy tylko po angielsku.
- Na stronę projektu wgrywamy tylko obrazy (≤ 10 MB). Wideo i dokumenty dajemy jako link.
- W materiałach nie może być wizerunku osób poniżej 18 lat. **W naszym zespole jest osoba < 18**, więc: zero twarzy i zdjęć, głos tylko 18+ albo syntezator, a najlepiej same napisy (szczegóły: [DEMO-PLAN.md §1](DEMO-PLAN.md)).

## Kryteria oceny

**Impact · Creativity · Validity · Relevance · Presentation**

Co to dla nas znaczy:
- **Validity**: pokazujemy zgodność z JPL Horizons (0,001°) i z mapami PGDA.
- **Relevance**: trafiamy w hasła z opisu wyzwania: porównanie miejsc i dat, czas do sunset/Earthset, okna DTE, teren.
- **Impact**: re-planning po poślizgu misji („slip +1/+7/+30 dni”).

## Demo: scenariusz wideo 30 s (wg oficjalnego szablonu)

| Czas | Treść |
|---|---|
| 0:00 | Kim jesteśmy (nazwa zespołu) |
| 0:02 | Jakie wyzwanie i dlaczego je wybraliśmy |
| 0:05 | Nazwa projektu i tagline |
| 0:10 | Jak działa: ekran aplikacji, dane NASA, które to umożliwiają |
| 0:20–0:30 | Wizja: co to da planistom misji i edukacji |

## Pitch dla lokalnego jury (~3–5 min, jeśli jest)

1. **Problem** (30 s): biegun południowy, Słońce i Ziemia tuż przy horyzoncie.
2. **Rozwiązanie** (30 s): jedno zdanie i zrzut ekranu.
3. **Demo na żywo** (1–2 min): wybór miejsca, data, slip +7 dni, porównanie.
4. **Dane i technologia** (30 s): Horizons, LOLA, DE440, Rust.
5. **Co dalej** (30 s).

## Plan B na demo

- Nagrane wideo z działającej wersji (na wypadek braku Wi-Fi).
- Kernele i DEM lokalnie, aplikacja działa offline.
- Zbudowana wersja release: `cargo build --release`.

## Teksty strony projektu (EN, szkic W4)

Gotowe do wklejenia w pola formularza. `[[...]]` = do uzupełnienia przez zespół. `⚠️ jeśli gotowe` = zostawić tylko, gdy funkcja działa w wersji z feature freeze (nd 10:00); inaczej usunąć zdanie. Nazwę projektu i tagline wybiera zespół (AI nie może wymyślać pomysłu).

### Project Name

[[Project name]]: working title "Lunar Landing Site Navigator"

### High-Level Summary

Near the lunar south pole the Sun and Earth never climb more than a few degrees above the horizon, so a small ridge can decide whether a lander has power and a direct radio link to Earth. [[Project name]] is a web tool that answers this quickly. Pick a landing site (Apollo, CLPS, Chandrayaan-3, SLIM, Chang'e, Artemis candidate regions, or your own coordinates) and a date. It shows where the Sun and Earth are relative to the local horizon, when sunlight and direct-to-Earth (DTE) windows open and close, and how long until sunset and Earthset. Sites and dates can be compared side by side, including a "launch slips by +1 / +7 / +30 days" view. Mission planners can re-plan quickly, and students can see why the pole is hard. Sun and Earth positions are computed from NASA/JPL DE440 ephemerides and agree with JPL Horizons to 0.001°.

### Detailed Description

**What it does**
- Site picker with 29 curated lunar sites (12 near the south pole) plus custom latitude/longitude.
- For any date and time span: Sun and Earth azimuth and elevation, the fraction of the solar disk above the horizon, and Earth visibility.
- Key metrics per site: % of time in sunlight, % of time with Earth in view, longest night, longest DTE gap, hours to next sunset and Earthset, and the list of sunlight and DTE windows.
- Elevation timeline chart and one-click date slips (+1 / +7 / +30 days).
- ⚠️ if ready: polar sky plot with the horizon, Sun and Earth drawn to scale; side-by-side comparison of 2–3 sites.
- ⚠️ if ready: horizon built from real terrain (LRO LOLA polar elevation model), not a smooth sphere.

**How it works**
- Backend in Rust (axum web server). Ephemerides via the ANISE library, reading NASA NAIF SPICE kernels (DE440s planetary ephemeris, lunar orientation `moon_pa_de440_200625`, frame `MOON_ME_DE440_ME421`).
- For each time step it converts Sun and Earth positions into the local topocentric frame of the site (east-positive longitude, 1737.4 km reference sphere, the same convention JPL Horizons uses). Then it compares their elevation with the horizon mask, sampled every 0.5° of azimuth.
- ⚠️ if ready: the horizon mask comes from ray-marching the LOLA 40 m/pixel south-polar DEM in 720 directions, including lunar curvature.
- A simple JSON API (`/api/sites`, `/api/track`) feeds a static HTML/JavaScript front end, so the tool runs offline on a laptop.

**Validation**
- Sun and Earth elevations match JPL Horizons to 0.001° (automated test at Shackleton crater). Example: maximum Earth elevation at Shackleton on 24 Nov 2026 is 5.927° in our tool vs 5.926° in Horizons.
- Sanity check: at Tranquility Base (Apollo 11) Earth is in view 100% of the time and the Sun about 50%, as expected for the near side.
- ⚠️ if ready: illumination percentages compared with NASA GSFC PGDA south-pole illumination maps for [[N]] sites: [[table / link]].

**Benefits and goals**
- Answers "is this site and date good enough for power and communications?" in seconds, without having to master Quickmap, Moon Trek or Horizons.
- Supports quick re-planning when missions slip, which happens often with CLPS and Artemis.
- Explains polar illumination to the public: why a few degrees of terrain matter, and why Earth "wobbles" at the horizon (libration).

**Tools**
Rust, axum, ANISE, NASA NAIF SPICE kernels, HTML/JavaScript, GitHub Actions CI (fmt, clippy, tests), Claude Code and Antigravity (see Use of AI).

**Known limitations**
NASA has not published centre coordinates for the Artemis candidate regions, so we use clearly labelled proxy points (LROC mosaic centres, crater rims, published studies). [[Add: smooth-sphere horizon if the DEM did not make it.]]

### Use of AI

We used AI as a tool. The challenge choice and the core idea (compare sites and dates by Sun and Earth vs horizon, with mission-slip re-planning) are our own.
- **Code:** Claude Code (Anthropic) and Google Antigravity helped write and review Rust and JavaScript code. All AI-written code was reviewed by the team and checked by automated tests. The ephemeris output is verified against JPL Horizons.
- **Research and data:** AI assistants helped search for and summarise sources (NASA, USGS, LROC, papers). Every coordinate in `data/sites.json` has a source link, and unverified values are marked as such.
- **Documentation and texts:** AI helped draft documentation and this project page; the team edited the final text.
- **Images and video:** [[none AI-generated / list them; AI images must carry a watermark]]. No NASA logos, flags or mission insignia in AI-generated content.

### NASA Data

- **NASA/JPL NAIF SPICE kernels**: DE440s planetary ephemeris and DE440 lunar orientation (https://naif.jpl.nasa.gov/).
- **JPL Horizons**: reference values used to validate our Sun and Earth positions (https://ssd.jpl.nasa.gov/horizons/).
- **LRO LOLA polar DEM** (`ldem_80s_40m`, `ldem_75s_120m`), PDS Geosciences Node (https://pds-geosciences.wustl.edu/).
- **LROC** NAC mosaics and **Quickmap**: locating Artemis candidate regions (https://data.lroc.im-ldi.com/, https://quickmap.lroc.asu.edu/).
- **NSSDC**: Apollo landing site coordinates (https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html).
- **NASA Artemis candidate landing regions** (Oct 2024 update) and CLPS mission pages on nasa.gov.
- ⚠️ if used: **NASA GSFC PGDA** lunar south pole illumination maps (Mazarico et al.).

### Space Agency Partner Data and Other References

- **ISRO**: Chandrayaan-3 (Vikram) landing site, Statio Shiv Shakti (via USGS Gazetteer).
- **JAXA**: SLIM landing site near Shioli crater.
- **CNSA**: Chang'e 3–6 landing sites and the planned Chang'e 7 site (USGS Gazetteer, Wikipedia; marked unverified where applicable).
- **USGS Gazetteer of Planetary Nomenclature**: feature coordinates (https://planetarynames.wr.usgs.gov/).
- Wueller et al. (2026), JGR Planets, doi:10.1029/2025JE009434, and arXiv:2406.19863 (Acta Astronautica 226, 2025): positions inside Artemis candidate regions.
- Wikipedia, "List of artificial objects on the Moon": secondary source for some CLPS and ispace sites.
- Software: Rust, axum, ANISE (Nyx Space), [[front-end libraries if any]].
