# Lunar Landing Site Navigator: research przed hackathonem

NASA Space Apps Challenge 2026, Rzeszów, 14–15.11.2026. Stan wiedzy na 13.11.2026.

Konwencja: każda liczba ma źródło (URL) albo dopisek **niezweryfikowane**. Oznaczenie „✅ przetestowane” znaczy, że sprawdziłem to sam w tej sesji (wywołanie API albo uruchomiony kod).

---

## TL;DR: co zrobić dziś wieczorem

1. **Architektura: hybryda.** Ephemerydy liczymy offline w Ruście przez `anise` 0.10.6. Kompiluje się na Windows/MSVC bez C/clang, a wyniki **zgadzają się z JPL Horizons co do 0,001°** (✅, sekcja 2). Horizons służy tylko do walidacji i jako fallback. Teren (horyzont) liczymy sami z LOLA DEM.
2. **Pobrać teraz** (łącznie ok. 1,1 GB, do `data/raw/`, nie commitować):
   - kernele (ok. 45 MB):
     - `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp` (31 MB)
     - `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc` (12 MB)
     - `http://public-data.nyxspace.com/anise/v0.7/moon_fk_de440.epa` (286 B)
   - DEM LOLA (PDS, surowe `.img`, int16):
     - `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_40m.img` (462 MB) plus `.lbl`
     - `.../img/ldem_75s_120m.img` (116 MB) plus `.lbl`, dla stron przy 80°S, np. IM-1
     - opcjonalnie `.../img/ldem_85s_20m.img` (460 MB) plus `.lbl`, dla wyższej rozdzielczości przy biegunie
   - do walidacji (PGDA, Mazarico et al.): `AVGVISIB_85S_060M_201608.TIF` i `AVGVISIB_85S_060M_201608_EARTH.TIF` z `https://pgda.gsfc.nasa.gov/data/MoonIllumination/`. Dokładne nazwy sprawdzić na https://pgda.gsfc.nasa.gov/products/69.
3. **Lista stron jest gotowa:** `data/sites.json` (29 pozycji, 12 południowo-polarnych).
4. **Reguły zgłoszenia (✅ sekcja 7):** deadline **nd 15.11.2026, 23:59 CET**; demo to **wideo ≤ 30 s albo ≤ 7 slajdów**, po angielsku, inaczej odpadamy z Global Judging.
5. **MVP:** `axum` + `anise` + własny ray-marching po DEM. Frontend: polarny sky-plot (SVG/Canvas) z linią horyzontu, Słońcem i Ziemią, oś czasu ze slajderem, porównanie 2–3 stron obok siebie, wykres elewacji w czasie i metryki (procent oświetlenia, okna DTE, czas do zachodu Słońca i do Earthset).

---

## 1. JPL Horizons API

**Endpoint:** `https://ssd.jpl.nasa.gov/api/horizons.api` (GET). Dokumentacja: https://ssd-api.jpl.nasa.gov/doc/horizons.html. Parametr `format=json` (domyślny) albo `text`. JSON zawiera pole `result` z tym samym tekstem, który zwraca wersja tekstowa. Dane leżą między `$$SOE` i `$$EOE`.

### Przetestowany przykład ✅ (Ziemia widziana z krawędzi krateru Shackleton)

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=json
  &COMMAND='399'            (Earth; Sun = '10')
  &OBJ_DATA='NO'
  &MAKE_EPHEM='YES'
  &EPHEM_TYPE='OBSERVER'
  &CENTER='coord@301'       (user-defined site na Księżycu, 301 = Moon)
  &COORD_TYPE='GEODETIC'
  &SITE_COORD='-129.78,-89.45,0'   (E-lon [deg], lat [deg], wysokość [km])
  &START_TIME='2026-11-14' &STOP_TIME='2026-12-14' &STEP_SIZE='12 h'
  &QUANTITIES='4,13'        (4 = apparent Az/El, 13 = średnica kątowa ["])
  &CSV_FORMAT='YES' &ANG_FORMAT='DEG'
```

W samym URL-u apostrofy kodujemy jako `%27`, a spacje jako `%20`. Gotowa linia:

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27399%27&OBJ_DATA=%27NO%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27OBSERVER%27&CENTER=%27coord@301%27&COORD_TYPE=%27GEODETIC%27&SITE_COORD=%27-129.78,-89.45,0%27&START_TIME=%272026-11-14%27&STOP_TIME=%272026-12-14%27&STEP_SIZE=%2712%20h%27&QUANTITIES=%274,13%27&CSV_FORMAT=%27YES%27&ANG_FORMAT=%27DEG%27
```

Fragment odpowiedzi (✅, 13.11.2026):

```
Center geodetic : -129.78, -89.45, ...   {E-lon(deg),Lat(deg),Alt(km)}
Center pole/equ : MEAN_ME (high precision)
Center radii    : 1737.4, 1737.4, 1737.4 km
Atmos refraction: NO (AIRLESS)
 2026-Nov-14 00:00,*, , 128.518220,    -4.990794,  6485.775,
 2026-Nov-24 00:00,*,i, 126.220808,     5.926124,  7262.823,
 2026-Dec-07 00:00,*, , 134.124933,    -7.224027,  6564.815,
```

Kolumny: data UT, znak obecności Słońca (`*` = dzień), znak `i` (górna krawędź Ziemi nad horyzontem matematycznym), Azi, Elev, średnica kątowa Ziemi w arcsec. W tym miesiącu Ziemia z tego miejsca zmienia elewację od −7,2° do +5,9°, a jej średnica kątowa od 6473″ do 7325″, czyli od 1,80° do 2,03°.

### Najważniejsze fakty

- **Format SITE_COORD:** `E-lon, lat, alt_km`. Długość dodatnia na wschód (Księżyc). Horizons rozumie `COORD_TYPE='GEODETIC'` (domyślny) albo `'CYLINDRICAL'` (doc API).
- **Układ odniesienia:** MEAN_ME, sfera 1737,4 km (nagłówek odpowiedzi, ✅). Współrzędne LOLA też są w MOON_ME (DE421), więc są zgodne z dokładnością do metrów.
- **Az/El (quantity 4):** cytat z odpowiedzi: „Airless apparent azimuth and elevation of target center … Azimuth is measured clockwise from north … Elevation angle is with respect to a plane perpendicular to the reference surface local zenith direction.” Elewacja jest więc liczona względem płaszczyzny stycznej do **sfery referencyjnej**. **Teren nie jest uwzględniany.** Odpowiedź mówi tylko o „reference surface” i „AIRLESS” i nie wspomina topografii. Dotyczy **środka** tarczy, nie krawędzi. Znak `*` (dzień) dotyczy górnej krawędzi tarczy względem horyzontu matematycznego.
- **Limit ✅:** maksymalnie **90 000 kroków na zapytanie**. Przy 1 roku co 5 min serwer zwrócił „Output length exceeded, 97560 times requested, max. is 90000”. Rok co 10 min (52 561 wierszy, 2,6 MB) wykonał się w ok. 7,7 s. `TLIST`: do 10 000 dyskretnych czasów (doc API). Krok musi być większy niż 0,5 s (doc API).
- **Etykieta i rate limit:** dokumentacja API nie podaje limitu. Manual zaleca 1–2 s odstępu między żądaniami w trybie e-mail. Rozsądnie jest wysyłać zapytania **sekwencyjnie, bez równoległości**, a wyniki cache'ować na dysku. Błędy wejścia wracają jako HTTP 200 z komunikatem w `result`, więc trzeba sprawdzać obecność `$$SOE`. 503 oznacza przeciążenie.
- **Przydatne quantities:** 4 (Az/El), 13 (średnica kątowa), 20 (odległość i prędkość radialna). Numery 10 (illuminated fraction) i 24 (Sun-Target-Observer angle) są **niezweryfikowane**: definicje są w części manuala, której nie przeczytałem: https://ssd.jpl.nasa.gov/horizons/manual.html.

---

## 2. Ephemerydy offline w Ruście

### `anise` (nyx-space): rekomendowane ✅

- Wersja na crates.io: **0.10.6** (aktualizacja 2026-10-19; crates.io API). Licencja MPL-2.0. README: „a fresh, Rust-powered alternative to the NAIF SPICE toolkit”. Według README była używana operacyjnie w misji Firefly Blue Ghost M1. https://github.com/nyx-space/anise
- Obsługuje SPK/BSP i BPC bezpośrednio. Kernele tekstowe (FK/TPC) trzeba skonwertować do `.pca`/`.epa`. Gotowy plik `moon_fk_de440.epa` hostuje nyx-space.
- **Na Windows/MSVC buduje się czysto** (✅ `cargo check`/`cargo run` w scratchpadzie). Nie wymaga C, clang ani CSPICE.
- Przydatne API (docs.rs): `Almanac::new/load`, `transform(target, observer_frame, epoch, ab_corr)`, `azimuth_elevation_range_sez*`, `Location { latitude_deg, longitude_deg, height_km, frame, terrain_mask: Vec<TerrainMask>, terrain_mask_ignored }`. ANISE ma więc nawet natywne maski terenu. `Almanac::until_2035()` (feature `embed_ephem`) wbudowuje ephemerydy w binarkę.
- **Pułapka znaleziona w teście ✅:** `MOON_ME_FRAME` (ID 31001) daje błąd `UnknownId { id: 31001 }` z `moon_fk_de440.epa` z v0.7. Trzeba użyć **`MOON_ME_DE440_ME421_FRAME`** (ID 31009) albo `MOON_PA_DE440_FRAME`.

**Walidacja ✅** (site −89,45°, −129,78°E, 2026-11-14 00:00 UTC):

| | ANISE (nasz kod) | Horizons |
|---|---|---|
| Słońce az / el | 256,384° / 1,427° | 256,3835° / 1,4272° |
| Ziemia az / el | 128,518° / −4,991° | 128,5182° / −4,9908° |

Działający kod (anise 0.10.6, przetestowany):

```rust
use anise::prelude::*;
use anise::math::Vector3;
use anise::constants::frames::{SUN_J2000, EARTH_J2000, MOON_ME_DE440_ME421_FRAME};

let almanac = Almanac::new("data/kernels/de440s.bsp")?
    .load("data/kernels/moon_pa_de440_200625.bpc")?
    .load("data/kernels/moon_fk_de440.epa")?;
let epoch = Epoch::from_gregorian_utc_at_midnight(2026, 11, 14);
let st = almanac.transform(SUN_J2000, MOON_ME_DE440_ME421_FRAME, epoch, Aberration::LT_S)?;
let r = st.radius_km;                                  // wektor Księżyc -> Słońce w osiach MOON_ME
let (lat, lon) = ((-89.45f64).to_radians(), (-129.78f64).to_radians());
let up    = Vector3::new(lat.cos()*lon.cos(), lat.cos()*lon.sin(), lat.sin());
let east  = Vector3::new(-lon.sin(), lon.cos(), 0.0);
let north = up.cross(&east);
let d  = r - up * (1737.4 + h_km);                     // topocentryczny wektor
let el = (d.dot(&up) / d.norm()).asin().to_degrees();
let az = d.dot(&east).atan2(d.dot(&north)).to_degrees().rem_euclid(360.0);
```

Koszt jest pomijalny: rok co 10 min to ok. 52 tys. wywołań `transform`. Pomiaru nie robiłem, więc wydajność jest **niezweryfikowana**, ale spodziewam się sekund.

### Kernele NAIF (rozmiary z listingów katalogów, ✅)

| Plik | Rozmiar | URL | Uwagi |
|---|---|---|---|
| `de440s.bsp` | 31 MB | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp | zakres ok. 1849–2150 (**niezweryfikowane** w tej sesji) |
| `de440.bsp` | 114 MB | jw. `/de440.bsp` | niepotrzebny |
| `de442s.bsp` | 31 MB | jw. `/de442s.bsp` | nowszy (2025), opcjonalny |
| `moon_pa_de440_200625.bpc` | 12 MB | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc | zakres 1549-12-31 – 2650-01-25 (plik `.cmt`) |
| `moon_de440_250416.tf` | 19 KB | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf | aktualny FK; MOON_PA=31000, MOON_ME=31001, MOON_PA_DE440=31008, MOON_ME_DE440_ME421=31009 |
| `pck00011.tpc` | 128 KB | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc | tylko dla IAU_MOON; niepotrzebny |
| `naif0012.tls` | 5 KB | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls | ANISE ma wbudowane sekundy przestępne (hifitime) |
| `moon_fk_de440.epa` (ANISE) | 286 B | http://public-data.nyxspace.com/anise/v0.7/moon_fk_de440.epa | odpowiednik FK dla ANISE |

### `rust-spice` (CSPICE bindings)

Wersja 1.0.1 (2026-09-14). README opisuje instalację tylko dla Linux/macOS: trzeba pobrać CSPICE, ustawić `CSPICE_DIR`, a `cspice-sys` wymaga clang (albo feature `noclang`). **Nie ma instrukcji dla Windows/MSVC.** CSPICE nie jest też thread-safe (feature `lock`). Źródło: https://static.crates.io/readmes/rust-spice/rust-spice-1.0.1.html. Na 2-dniowy hackathon na Windows **odradzam**.

### Rekomendacja

**Hybryda z naciskiem na ANISE offline.**
- ANISE liczy Az/El Słońca i Ziemi na żywo dla dowolnej strony i daty. Dzięki temu custom coordinates i slajder czasu działają bez sieci.
- Horizons: skrypt walidacyjny (kilka punktów kontrolnych w teście `cargo test`), a w razie problemów z ANISE fallback z wynikami pre-computed do JSON.
- Teren zawsze sami (sekcja 3). Ani Horizons, ani ANISE nie mają DEM-u. ANISE przyjmie gotową maskę przez `Location.terrain_mask`.

---

## 3. Topografia LOLA i maski horyzontu

### Produkty DEM

**A. PDS LOLA GDR polar (rekomendowane, najprostsze do wczytania).** Katalog: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/. Podkatalogi: `img/` (int16), `float_img/` (float32), `jp2/`. Rozmiary wzięte z listingu ✅:

| Plik (`img/`, int16) | Rozmiar | Pokrycie | Uwagi |
|---|---|---|---|
| `ldem_75s_120m.img` | 116 MB | 75–90°S | dla stron przy 80°S |
| `ldem_75s_60m.img` | 465 MB | 75–90°S | |
| `ldem_80s_80m.img` | 116 MB | 80–90°S | szybki start / dev |
| **`ldem_80s_40m.img`** | **462 MB** | 80–90°S | **główny** |
| `ldem_80s_20m.img` | 1,85 GB | 80–90°S | za duży na dziś |
| `ldem_85s_20m.img` | 460 MB | 85–90°S | |
| `ldem_85s_10m.img` | 1,84 GB | 85–90°S | |
| `ldem_875s_10m.img` / `_5m.img` | 460 MB / 1,84 GB | 87,5–90°S | |

Wersje `float_img/` mają dwukrotnie większe pliki (float32, km). Są też `.jp2` (np. `ldem_80s_40m.jp2` 268 MB), ale do JPEG2000 trzeba GDAL, więc **zalecam surowe `.img`**.

**Format (z `ldem_85s_40m.lbl` i `ldem_85s_40m_float.lbl`, ✅):**
- `img`: `SAMPLE_TYPE = LSB_INTEGER`, 16 bit, `SCALING_FACTOR = 0.5`, `UNIT = METER`, `OFFSET = 1737400`. Wysokość w metrach to `DN*0.5`, a promień `DN*0.5 + 1737400`.
- `float_img`: `PC_REAL` 32 bit, w km względem 1737,4 km.
- Kwadrat N×N bez nagłówka (np. 85S_40M: 7584×7584; 80S_40M: rozmiar wynika z pliku: 462 080 000 B / 2 = 15 200²).
- `POLAR STEREOGRAPHIC`, sfera **1737,4 km**, `CENTER_LATITUDE = -90`, `CENTER_LONGITUDE = 0`, `MAP_SCALE = 40 m/pix` (dokładne), `LINE/SAMPLE_PROJECTION_OFFSET = (N-1)/2`, układ „MEAN EARTH/POLAR AXIS OF DE421”.
- Wczytanie w Ruście: `memmap2` plus `&[i16]` (`bytemuck`/`from_le_bytes`). **Nie trzeba GDAL ani GeoTIFF.**

**Wzory projekcji** (PDS `DSMAP_POLAR.CAT`: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/dsmap_polar.cat):
```
lat/lon -> (I=sample, J=line), półkula S:
  R = 2*1737400*tan((90-|lat|)*pi/360) * (-1)
  X = R*sin(lon); Y = R*cos(lon)
  I = X/MAP_SCALE + N/2 + 0.5 ;  J = Y/MAP_SCALE + N/2 + 0.5
odwrotnie:
  X = (I - N/2 - 0.5)*MAP_SCALE ; Y = (J - N/2 - 0.5)*MAP_SCALE*(-1)
  R = hypot(X,Y); lon = atan2(X,Y); lat = -90 + 2*atan(0.5*R/1737400)
```
Uwaga: znaki w forward i inverse z katalogu PDS wyglądają na niespójne. Na południu „Longitude 0 extends straight up, 90E to the right”. **Pierwszego dnia zweryfikować orientację na znanym punkcie**, np. czy krater Shackleton (−89,67°, 129,78°E) wypada w dołku DEM-u, a Mons Malapert (−85,98°, −1,67°) na szczycie.

**B. PGDA 5 m/px (Barker et al. 2021).** https://pgda.gsfc.nasa.gov/products/81: mozaika `ldem_87s_5mpp.tif` (**3,3 GB**, GeoTIFF, polar stereographic, MOON_ME DE421, RMS 30–55 cm). Strony 20×20 km: https://pgda.gsfc.nasa.gov/products/78. Shape-from-shading: https://pgda.gsfc.nasa.gov/products/104. Według NTRS (Barker) ok. 90% pikseli 5 m jest interpolowanych. **Na hackathon za duże.** Najwyżej jako stretch dla jednej strony.

### Algorytm maski horyzontu (dla jednej strony)

Dla obserwatora O (lat, lon, h_O plus wysokość anteny/panelu, np. 2 m) i każdego azymutu α w siatce 0,5° (720 kierunków):
1. Idziemy po wielkim kole od O w kierunku α z krokiem s, od ok. 1 piksela przy O, rosnąco wraz z odległością (np. s = max(px, 0,5% d)), do d_max ≈ 150–200 km.
2. Punkt T na odległości kątowej θ = d/R. Jego lat/lon liczymy wzorem na „destination point”, potem mapujemy na piksel (bilinear), z którego mamy h_T.
3. **Elewacja z dokładną krzywizną:** r_O = R+h_O, r_T = R+h_T,
   `el = atan2(r_T*cos(θ) - r_O, r_T*sin(θ))`.
   Przybliżenie: `el ≈ atan((h_T - h_O - d²/(2R)) / d)`.
4. `mask[α] = max(el)`. Można przerwać wcześniej, gdy nawet szczyt 10 km dalej nie przebije obecnego maksimum.

**Zasięg:** horyzont geometryczny dla szczytu o wysokości h to √(2Rh). Dla 5 km wychodzi ok. 132 km. Ograniczenie: DEM 80S kończy się na ok. 80°S, czyli ok. 303 km od bieguna. Dla stron przy 80–83°S (IM-1, Cabeus B) trzeba użyć `ldem_75s_*`.

**Koszt:** 720 azymutów × ok. 1–4 tys. próbek, czyli ok. 1–3 mln odczytów bilinearnych. To milisekundy do ~100 ms na stronę (szacunek, **niezweryfikowane**). Z `rayon` po azymutach można liczyć na żądanie dla custom coordinates. Mapa dla każdego piksela byłaby o rzędy wielkości droższa (stretch: siatka grubsza, np. 1 km).

**Widoczność tarczy:** Słońce ma ok. 0,53°, a Ziemia ok. 1,8–2,0° (sekcja 5). Ułamek widocznej tarczy liczymy z (el_środka − mask(az)) / promień kątowy. Dla Słońca procent tarczy powyżej horyzontu to w przybliżeniu procent mocy, co przy biegunie ma znaczenie.

### Crate'y do GeoTIFF (gdyby potrzebne)

- `tiff` 0.11.3 (pure Rust, buduje się wszędzie). Czyta piksele, ale georeferencję (tagi GeoKey) trzeba wyciągnąć ręcznie.
- `geotiff` 0.1.0 (2025-06, pure Rust, młody, **niezweryfikowane** pod kątem dużych/tiled plików).
- `gdal` 0.19.0: bindings wymagają zainstalowanego GDAL (na Windows przez OSGeo4W/conda i zmienne `GDAL_HOME`). To ryzykowne na hackathonie. Opinia, **niezweryfikowane** w tej sesji.
- **Rekomendacja:** PDS `.img` przez `memmap2` (0.9.12). Konwersję GeoTIFF, jeśli potrzebna, zrobić raz w Pythonie (`rasterio`/`gdal`) do surowego `.f32`.

### Produkty referencyjne do walidacji

- **PGDA Lunar Polar Illumination (Mazarico et al. 2011, Icarus 211, 1066–1081):** https://pgda.gsfc.nasa.gov/products/69. `AVGVISIB_{65S_240M,75S_120M,85S_060M}_201608` (średnie oświetlenie), `..._EARTH` (średnia widoczność Ziemi: Ziemia widoczna, jeśli dowolna część tarczy jest odsłonięta), `LPSR_*` (permanentny cień), `SKYV_65S_240M` (sky view). Formaty IMG/JP2/TIF/COG, katalog TIF: https://pgda.gsfc.nasa.gov/data/MoonIllumination/. Średnie liczone z kroków godzinowych przez 18,6 roku. Nasze procenty oświetlenia i widoczności Ziemi dla stron można porównać z wartością piksela z tych map. **To mocny argument do pitchu („walidacja vs NASA GSFC”).** Rozmiary plików **niezweryfikowane**.
- LROC WAC south pole illumination maps (100 m/px): https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH.

---

## 4. Lista stron lądowania

Plik maszynowy: `data/sites.json` (pola: `name, mission, country_or_agency, lat_deg, lon_deg, south_polar, status, source_url` oraz dodatkowe `coord_note`). Długości są wschodnie, w zakresie −180..180. `south_polar = lat ≤ −80°` (definicja przyjęta przeze mnie). Statusy: `landed | planned | candidate_region | crashed`.

| Nazwa | Misja | lat | lon (E) | Bieg. płd. | Status | Źródło |
|---|---|---|---|---|---|---|
| Tranquility Base | Apollo 11 | 0.67416 | 23.47314 | | landed | NSSDC¹ |
| Oceanus Procellarum | Apollo 12 | -3.0128 | -23.4219 | | landed | NSSDC¹ |
| Fra Mauro | Apollo 14 | -3.64589 | -17.47194 | | landed | NSSDC¹ |
| Hadley-Apennine | Apollo 15 | 26.13239 | 3.6333 | | landed | NSSDC¹ |
| Descartes Highlands | Apollo 16 | -8.9734 | 15.5011 | | landed | NSSDC¹ |
| Taurus-Littrow | Apollo 17 | 20.1911 | 30.7723 | | landed | NSSDC¹ |
| Odysseus k. Malapert A | IM-1 | -80.13 | 1.44 | TAK | landed (przewrócony) | NASA LRO² |
| Athena, Mons Mouton | IM-2 | -84.79056 | 29.19583 | TAK | landed (na boku) | Wikipedia³ (LROC cel: −84.78, 29.13⁴) |
| Blue Ghost, Mare Crisium | Blue Ghost M1 | 18.56222 | 61.81028 | | landed | Wikipedia³ |
| Atlas (uderzenie) | Hakuto-R M1 | 47.58111 | 44.09389 | | crashed | Wikipedia³ |
| Mare Frigoris (uderzenie) | Hakuto-R M2 Resilience | 60.44444 | -4.58806 | | crashed | Wikipedia³ |
| Sinus Viscositatis (cel) | Peregrine M1 | 35.25 | -40.99 | | planned* | NASA press kit⁵, wsp. = środek obiektu USGS, **niezweryfikowane** jako punkt celu |
| Statio Shiv Shakti | Chandrayaan-3 | -69.3734 | 32.3198 | (69°S) | landed | USGS⁶ |
| Guang Han Gong | Chang'e 3 | 44.1184 | -19.5123 | | landed | USGS⁶ |
| Statio Tianhe | Chang'e 4 | -45.45 | 177.6 | | landed | USGS⁶ |
| Statio Tianchuan | Chang'e 5 | 43.06 | -51.92 | | landed | USGS⁶ |
| Statio Tianjiang | Chang'e 6 | -41.63 | -153.98 | | landed | USGS⁶ |
| SLIM k. Shioli | SLIM | -13.31611 | 25.25111 | | landed (do góry nogami) | Wikipedia³ |
| Luna 25 (uderzenie) | Luna 25 | -57.865 | 61.36 | | crashed | Wikipedia³ |
| Shackleton rim peak | Chang'e 7 | -88.8 | 123.4 | TAK | planned (start przesunięty na 2027) | Wikipedia⁷, **niezweryfikowane** pierwotnie |
| Peak near Cabeus B | Artemis | -82.2587 | -54.5846 | TAK | candidate_region | NASA⁸ + proxy USGS⁶ |
| Haworth | Artemis | -87.45 | -5.17 | TAK | candidate_region | NASA⁸ + proxy USGS |
| Malapert Massif | Artemis | -85.98 | -1.67 | TAK | candidate_region | NASA⁸ + proxy USGS (Mons Malapert) |
| Mons Mouton Plateau | Artemis | -84.6 | 31.0 | TAK | candidate_region | NASA⁸ + proxy USGS |
| Mons Mouton | Artemis | -84.6 | 31.0 | TAK | candidate_region | NASA⁸ + proxy USGS |
| Nobile Rim 1 | Artemis | -85.2752 | 53.2725 | TAK | candidate_region | NASA⁸ + proxy USGS (środek krateru) |
| Nobile Rim 2 | Artemis | -85.2752 | 53.2725 | TAK | candidate_region | jw. |
| de Gerlache Rim 2 | Artemis | -88.4849 | -88.3447 | TAK | candidate_region | NASA⁸ + proxy USGS (środek krateru) |
| Slater Plain | Artemis | -88.0792 | 111.2881 | TAK | candidate_region | NASA⁸ + proxy USGS (środek krateru) |

\* Peregrine nigdy nie doleciał do Księżyca (awaria napędu, wejście w atmosferę Ziemi 18.01.2024).

Źródła:
1. NSSDC, pozycje LM, MOON_ME DE421: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html
2. https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/ (80,13°S, 1,44°E). Lista Wikipedii podaje 84°54′S 12°54′E, co jest najpewniej starym celem.
3. https://en.wikipedia.org/wiki/List_of_artificial_objects_on_the_Moon (źródło wtórne)
4. https://lroc.im-ldi.com/images/1401
5. https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf
6. USGS Gazetteer of Planetary Nomenclature (linki `planetarynames.wr.usgs.gov/Feature/<id>` w `sites.json`). Dane pobrane z `MOON_nomenclature_center_pts.zip`.
7. https://en.wikipedia.org/wiki/Chang%27e_7
8. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ (9 regionów, październik 2024)

**Ważne zastrzeżenia:**
- **Regiony Artemis:** NASA nie publikuje współrzędnych środków regionów. W tabeli są środki nazwanych obiektów USGS jako **proxy**, a „Rim”/„Plain” mogą być przesunięte o dziesiątki km. W UI pokazujemy je jako „region (przybliżony)”. Uwaga: pary *Mons Mouton* / *Mons Mouton Plateau* oraz *Nobile Rim 1* / *Nobile Rim 2* mają dziś **identyczne** współrzędne proxy. Przed demo warto je rozsunąć ręcznie, np. wybierając punkty na krawędzi w Quickmap, bo inaczej porównanie da dwa identyczne wyniki. Kontekst 2026: Artemis III została przeprojektowana na misję testową na LEO (2027), a pierwsze lądowanie to **Artemis IV, 2028** (https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/, https://www.nasa.gov/missions/artemis/nasas-artemis-iii-mission-to-test-future-moon-lander-operations/). Według NTRS 20250011660 lista 9 regionów dotyczy Artemis III. Czy obowiązuje dla Artemis IV: **niezweryfikowane**.
- **Lądowania w 2026:** nie znalazłem żadnego potwierdzonego. Chang'e 7 przesunięto (Wikipedia). Blue Moon MK1 „Endurance” (cel: Shackleton connecting ridge) wg źródeł wtórnych przesunięto na 2027, a współrzędnych nie zweryfikowałem, więc **pominięte w JSON**. IM-3 (Reiner Gamma), Griffin-1 (biegun płd., dokładny cel **niezweryfikowany**) i Blue Ghost M2 (far side; strona Firefly podaje podobno „Nassau Crater”, **niezweryfikowane**) to wszystko wg źródeł wtórnych 2026/2027, więc **pominięte**.

---

## 5. Ściąga fizyczna

| Wielkość | Wartość | Źródło |
|---|---|---|
| Miesiąc synodyczny (doba słoneczna na Księżycu) | 29,53 d | https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html |
| Promień średni | 1737,4 km | jw.; ten sam promień w LOLA i Horizons ✅ |
| Nachylenie orbity do ekliptyki | 5,145° | fact sheet |
| Nachylenie równika Księżyca do ekliptyki | 1,5427° | https://en.wikipedia.org/wiki/Libration |
| Libracja w długości | do 7°54′ (≈7,9°) | Wikipedia „Libration” |
| Libracja w szerokości | do 6°50′ (≈6,8°) | jw. |
| Odległość Ziemia–Księżyc | 363 300–405 500 km (perygeum/apogeum) | fact sheet |
| Średnica kątowa Ziemi z Księżyca | 1,80°–2,03° | ✅ Horizons Q13: 6473″–7325″; z geometrii 2·atan(6371/384400) ≈ 1,90° |
| Średnica kątowa Słońca z Księżyca | ≈0,53° | geometria: 2·atan(695700/1,496e8) |

**Dlaczego Słońce na biegunie „krąży po horyzoncie”:** oś obrotu Księżyca jest odchylona tylko o ok. 1,54° od normalnej do ekliptyki. Na samym biegunie deklinacja Słońca w układzie Księżyca waha się więc w ciągu roku w granicach ±1,54°. Elewacja Słońca na biegunie to w przybliżeniu ta deklinacja, a azymut obiega 360° co 29,53 d. Na szerokości φ elewacja oscyluje dobowo wokół tej wartości z amplitudą ok. 90° − |φ|. Test ✅: na −89,9° 14.11.2026 Horizons daje el = 1,547°–1,568°, a azymut maleje ok. 3°/6 h, co daje 360° na miesiąc synodyczny. Każdy metr wysokości i każdy pagórek ma więc znaczenie. To główna motywacja dla masek terenu.

**Ziemia na biegunie:** średnio Ziemia jest dokładnie na horyzoncie bieguna (ME: oś X na Ziemię). Libracja w szerokości (±6,8°) plus paralaksa kołysze ją w górę i w dół co ok. 27,2 d (miesiąc smoczy, wartość **niezweryfikowana** w tej sesji). Libracja w długości (±7,9°) przesuwa azymut. Test ✅ dla −89,45°, −129,78°: el od −7,2° do +5,9°, a górna krawędź nad horyzontem matematycznym mniej więcej od 17.11 do 30.11.2026. Daje to cykl ok. 2 tygodnie widoczna i 2 tygodnie niewidoczna, co zgadza się z prezentacją NASA dla Space Apps: https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf. Ta sama prezentacja podaje kryteria: strony w promieniu 6° od bieguna, nachylenie poniżej 10° na 100 m, maksimum oświetlenia ok. sierpnia.

**Moc z paneli:** P = P₀ · η · cos(i), gdzie i to kąt padania między normalną panelu a kierunkiem do Słońca, plus współczynnik odsłoniętej części tarczy. Przy biegunie Słońce ma el ≈ 0–3°, więc panel poziomy daje cos(87–90°) ≈ 0–5% mocy, a **panel pionowy** zwrócony do Słońca cos(el) ≈ 100%. Panel pionowy stały (np. zwrócony na azymut A) daje P ∝ cos(el)·max(0, cos(az_sun − A)), stąd potrzeba obrotu w azymucie albo wielu ścian. P₀ ≈ 1361 W/m² (stała słoneczna przy 1 AU; wartość standardowa, źródło nie było sprawdzane w tej sesji).

**DTE (direct-to-Earth):** warunek widoczności to el_Ziemi > mask_terenu(az_Ziemi) + margines. Typowy margines elewacji dla anten na powierzchni (np. 5–10°) jest **niezweryfikowany**: nie znalazłem źródła pierwotnego, więc w UI dajemy go jako parametr. Po stronie Ziemi DSN ma 3 kompleksy (Goldstone, Madrid, Canberra) rozstawione mniej więcej co 120° długości, więc Księżyc jest prawie zawsze widoczny z któregoś z nich (wiedza ogólna, **niezweryfikowane** w tej sesji). Można opcjonalnie liczyć elewację Księżyca nad stacjami DSN przez ANISE i `EARTH_ITRF93` (stretch).

---

## 6. Prior art i wyróżnik

| Narzędzie | Co robi | Luka |
|---|---|---|
| LROC Quickmap (https://quickmap.lroc.asu.edu/) | mapy, warstwy LOLA, profile | narzędzie GIS dla ekspertów; brak prostego „porównaj 3 strony w dacie X”. Czy ma warstwy oświetlenia: **niezweryfikowane** |
| NASA Moon Trek (https://trek.nasa.gov/moon/) | portal 2D/3D, narzędzia analityczne | skierowany do ekspertów; nie badałem funkcji Sun/Earth w tej sesji |
| JPL Horizons | precyzyjne Az/El | brak terenu, brak wizualizacji, interfejs dla specjalistów |
| PGDA Mazarico et al. (https://pgda.gsfc.nasa.gov/products/69) | średnie oświetlenie i widoczność Ziemi z terenem | statyczne mapy uśrednione po 18,6 roku; **nie** dla konkretnej daty |
| ANISE (nyx-space) | ephemerydy i `terrain_mask` | biblioteka bez UI i bez DEM |
| NASA App Development Challenge (2023, dla szkół) | wizualizacja bieguna płd. z CSV (wysokość, nachylenie, widoczność Ziemi) | https://www.nasa.gov/learning-resources/app-development-challenge/2023-handbook-and-coding-components; dane uproszczone, bez ephemeryd w czasie |

Nie znalazłem zwycięskiego projektu Space Apps 2024/2025 robiącego dokładnie to samo. Wyszukiwanie było pobieżne, a strona https://www.spaceappschallenge.org/2025/awards/ była nieosiągalna (TLS), więc **niezweryfikowane**.

**Proponowany wyróżnik do pitchu:**
1. **Data-specific plus teren:** „co zobaczy lądownik w dniu X na stronie Y”, a nie średnie mapy. Horyzont z LOLA i dokładne ephemerydy DE440.
2. **Re-planning po poślizgu:** kafelki „slip +1 / +7 / +30 dni” z natychmiastową zmianą metryk (procent Słońca w pierwszych N dniach, najbliższe okno DTE, czas do Earthset). To trafia w opis wyzwania (CLPS schedule slips).
3. **Walidacja z NASA:** pokazujemy zgodność z Horizons (0,001°) i z mapami PGDA.
4. **Przystępność:** tryb „publiczny” (animacja nieba, prosty język, kolory dostępne dla daltonistów) i tryb „ekspert” (eksport CSV, wartości liczbowe).
5. **Rust:** jedna binarka, działa offline, liczy custom coordinates w czasie rzeczywistym.

---

## 7. Reguły zgłoszenia Space Apps 2026

✅ Zweryfikowane w przeglądarce 13.11.2026 z oficjalnego **Project Submission Guide** (opublikowany 12.11.2026): https://www.spaceappschallenge.org/resources/project-submission-guide/

- **Okno zgłoszeń:** od **sob 14.11, 9:00** do **nd 15.11, 23:59** czasu lokalnego wydarzenia (Rzeszów = CET). Po tym czasie nic nie zostanie ocenione. Lokalne jury i nagrody mogą mieć **inne godziny**, więc pytamy Local Leada.
- **Zakładka „Project”** pojawia się na stronie zespołu dopiero 14.11 o 9:00. Edycję trzeba blokować przełącznikiem „Lock” i często klikać „Save Progress”.
- **Pola formularza:** Project Name; High-Level Summary; Link to Project Demo; Link to Final Project; Detailed Description (co robi, jak działa, korzyści, narzędzia i języki); Use of SI; NASA Data; Space Agency Partner Data and Other References.
- **Demo (obowiązkowe):** **wideo ≤ 30 s** albo **≤ 7 slajdów**, wliczając tytułowy i intro. **Przekroczenie limitu wyklucza z Global Judging.** Wideo może być w innym języku, ale musi mieć angielskie napisy; slajdy tylko po angielsku. Hosting zewnętrzny (YouTube, Drive, GitHub), publiczny link bez logowania.
- **Język:** wszystko na stronie zgłoszenia i w podlinkowanych materiałach **po angielsku**.
- **Pliki:** na stronę można wgrać tylko obrazy (JPG/PNG/GIF ≤ 10 MB). Wideo i dokumenty podlinkowujemy.
- **Dane NASA:** trzeba użyć co najmniej jednego źródła danych lub zasobu NASA, inaczej nie ma szans na Global Award. U nas: Horizons, LOLA, DE440 (NAIF/JPL), PGDA.
- **Partnerzy:** mile widziane dane agencji partnerskich (np. CSA, ESA, ISRO, JAXA). U nas pasuje JAXA SLIM i ISRO Chandrayaan-3 jako miejsca na liście; to jeszcze do opisania.
- **SI (AI):** dozwolone jako narzędzie, ale **nie do wymyślenia pomysłu** na rozwiązanie. Trzeba wskazać, gdzie i jak użyto SI: obrazy i wideo z widocznym znakiem wodnym, kod i dane z adnotacją w opisie i metadanych. Treści generowane nie mogą zawierać ani modyfikować brandingu NASA (logo, flagi, identyfikatory misji). Odpowiedź w polu „Use of SI” nie trafia do jury, ale jury widzi oznaczenia w projekcie.
- **Kryteria oceny:** **Impact, Creativity, Validity, Relevance, Presentation** (szczegóły w 2026 Judging and Awards Guide).
- **Inne:** cały zespół musi być potwierdzony na **tym samym** wydarzeniu lokalnym. Wymagane pola nie mogą być puste. W materiałach nie może być wizerunku osób poniżej 18 lat.
- **Strona projektu:** jeśli robimy własną stronę WWW, warto zgłosić ją do FortiGuard Web Filter Classification, żeby jury nie miało jej zablokowanej. Nie jest to wymagane.

---

## 8. Rekomendowane MVP na 48 h

### Architektura

```
data/raw/ (DEM .img/.lbl, kernele)       [poza gitem]
        │
Rust backend (axum)
 ├─ ephem: anise Almanac (Sun/Earth Az/El, odległość, średnica kątowa)
 ├─ dem:   memmap2 + polar stereo + bilinear
 ├─ horizon: maska 720 az (rayon), cache per site (JSON na dysku)
 ├─ metrics: % tarczy Słońca, okna DTE, czas do sunset/Earthset, P(panel pionowy)
 └─ API: GET /api/sites
         GET /api/horizon?lat&lon&h
         GET /api/track?lat&lon&start&end&step   -> [{t, sun_az, sun_el, sun_vis, earth_az, earth_el, earth_vis}]
         GET /api/summary?site_ids&start&days    -> tabela porównawcza
        │ (tower-http: CORS + ServeDir dla frontendu)
Frontend (statyczny, Vite + TS albo czysty JS)
 ├─ lista stron + custom lat/lon
 ├─ polarny sky-plot (SVG/Canvas): sylwetka horyzontu, Słońce, Ziemia (do skali), ślad
 ├─ panorama horyzontu 360° (az × el, oś el przeskalowana np. -5..+15°)
 ├─ timeline: slajder + play, wykres el(t) Słońca i Ziemi z pasami widoczności
 └─ porównanie 2–3 stron obok siebie + przyciski „slip +1/+7/+30 d”
```

### Crate'y (wersje z crates.io, 13.11.2026, ✅)

`anise = "0.10.6"`, `hifitime = "4.3.2"` (Epoch, reeksportowany przez ANISE), `axum = "0.8.9"`, `tokio = "1.54.1"` (features `full`), `tower-http = "0.7.1"` (features `cors`, `fs`), `serde = "1.0.229"` (`derive`), `serde_json = "1.0.154"`, `rayon = "1.12.0"`, `memmap2 = "0.9.12"`, `nalgebra = "0.35.0"` (opcjonalnie, ANISE ma `Vector3`), `reqwest = "0.13.5"` (tylko skrypt walidacji Horizons), `image = "0.25.10"` (opcjonalnie, render podglądu DEM/hillshade do PNG). Frontend bez frameworka 3D w MVP. Stretch: Three.js (teren 3D z wycinka DEM) albo CesiumJS. Cesium ma globus Ziemi; wsparcie dla Księżyca istnieje (`Ellipsoid.MOON`), ale jakość tego wsparcia jest **niezweryfikowana**.

Uwaga: `Cargo.toml` repo ma `edition = "2024"`. ANISE sprawdziłem w projekcie z `edition = "2021"`; zależności są niezależne od edycji, więc nie powinno to mieć znaczenia.

### Zakres

**MVP (musi działać w niedzielę rano):**
1. `sites.json` plus custom coordinates.
2. Az/El Słońca i Ziemi z ANISE, krok 10–30 min, okno 1–60 dni.
3. Maska horyzontu z `ldem_80s_40m` (i 75S_120M dla ok. 80°S); dla stron spoza bieguna horyzont sferyczny (mask = 0).
4. Metryki: procent czasu ze Słońcem (z udziałem tarczy), najdłuższa noc, procent czasu z Ziemią (DTE), najbliższe okno DTE, czas do następnego zachodu Słońca i Earthset od wybranej chwili.
5. Sky-plot, wykres el(t) z pasami widoczności, porównanie 2–3 stron.
6. Strona „Validation”: tabelka ANISE vs Horizons i nasz procent oświetlenia vs PGDA AVGVISIB dla 3–4 stron.

**Stretch:** heatmapa procentu oświetlenia dla małego obszaru (siatka 1 km), animacja „dzień z życia lądownika”, eksport CSV, wysokość masztu i anteny jako parametr, 3D (Three.js) z wycinka DEM, sezonowość (rok z krokiem 1 h), elewacja Księżyca nad DSN.

### Przygotowanie danych dziś wieczorem

1. Pobrać pliki z TL;DR do `data/raw/` (ten katalog jest już w `.gitignore`).
2. Sprawdzić sumy rozmiarów: `ldem_80s_40m.img` ma mieć dokładnie 462 080 000 B, `ldem_75s_120m.img` 116 250 752 B.
3. Zapisać `.lbl` obok `.img`. Parser ma czytać `LINES`, `MAP_SCALE`, `SCALING_FACTOR` z labela zamiast hardkodu.
4. (Opcjonalnie) Python: szybki podgląd `numpy.fromfile(..., '<i2').reshape(N,N)*0.5` i `matplotlib`, żeby od razu zweryfikować orientację projekcji (Shackleton jako dołek).

### Podział zadań (4–5 osób)

| Osoba | Zadanie |
|---|---|
| A (Rust, ephem) | moduł `ephem` (ANISE), testy vs Horizons, endpoint `/api/track` |
| B (Rust, teren) | parser PDS `.img`/`.lbl`, projekcja, bilinear, maska horyzontu + cache, testy orientacji |
| C (Rust/API) | `axum`, `metrics` (okna widoczności, sunset/Earthset, moc), `/api/summary`, serwowanie frontu |
| D (Frontend) | sky-plot, panorama, timeline, porównanie, tryb public/ekspert, dostępność |
| E (Dane/pitch) | `sites.json` (UI dla regionów proxy), walidacja PGDA, slajdy, wideo demo, strona zgłoszenia, sekcja „Use of AI” |

Kamienie milowe: sob 12:00, pierwszy `/api/track` i surowy wykres w przeglądarce. Sob 20:00, maska horyzontu na sky-plocie. Nd 10:00, feature freeze, potem nagranie demo i zgłoszenie z zapasem przed 23:59.

---

## Lista rzeczy niezweryfikowanych (zbiorczo)

- Współrzędne środków regionów Artemis (użyte proxy USGS), aktualność listy 9 regionów dla Artemis IV.
- IM-2: dokładny punkt lądowania (Wikipedia; LROC podaje tylko cel). Peregrine: cel jako środek Sinus Viscositatis. Chang'e 7: współrzędne z Wikipedii.
- Status i cele misji 2026/2027: Blue Moon MK1, Griffin-1, IM-3, Blue Ghost M2.
- Zakres czasowy `de440s.bsp` (ok. 1849–2150), miesiąc smoczy 27,2 d, stała słoneczna 1361 W/m², marginesy elewacji anten DTE, rozmieszczenie DSN.
- Numery quantities Horizons 10 i 24; brak oficjalnego rate limitu (dokumentacja milczy).
- Spójność znaków we wzorach projekcji PDS (do sprawdzenia na danych).
- Wydajność maski horyzontu i pętli ANISE (szacunki, bez benchmarku).
- Funkcje Quickmap i Moon Trek dotyczące oświetlenia; brak podobnych zwycięzców Space Apps 2024/2025.
- Budowanie `gdal` i `geotiff` na Windows.
