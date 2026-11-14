# Walidacja: jak dokładne są nasze liczby? (W4)

> Stan: L4, sob 14.11. Sekcje 1 i 3 z wynikami z serwera (maska LOLA na main `580c29b`). Otwarte: najlepsze punkty Busseya w promieniu 500 m (L2). Liczby wyliczone przez nas (nie z literatury) są oznaczone jako **szacunek**.

## 1. Efemerydy: Słońce i Ziemia vs JPL Horizons

Test automatyczny: `matches_horizons_shackleton` w `src/ephem.rs` (tolerancja 0,001°).

Wartości referencyjne Horizons (API `ssd.jpl.nasa.gov/api/horizons.api`, `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, wysokość 0, `QUANTITIES='4'`, czas UT, bez refrakcji, pobrane 14.11.2026). „Nasze” = `points[0]` z `/api/track` na serwerze L1 (main `52c8dd8`, DE440s), zaokrąglone przez L1 do 0,0001°.

| Miejsce | lat, lon | Czas UTC | Słońce az / el: Horizons | Słońce az / el: nasze | Ziemia az / el: Horizons | Ziemia az / el: nasze | Max \|Δ\| |
|---|---|---|---|---|---|---|---|
| Shackleton | -89.45, -129.78 | 2026-11-14 00:00 | 256.383540 / 1.427188 | 256.3835 / 1.4272 | 128.518220 / -4.990794 | 128.5182 / -4.9908 | 0.00004° |
| Shackleton | -89.45, -129.78 | 2026-12-05 12:00 | 355.063550 / 2.000706 | 355.0636 / 2.0007 | 135.363953 / -6.849995 | 135.3640 / -6.8500 | 0.00005° |
| Malapert Massif | -85.98, -1.67 | 2026-11-20 06:00 | 52.383802 / 4.002389 | 52.3838 / 4.0024 | 354.389291 / 7.489848 | 354.3893 / 7.4898 | 0.00005° |
| Apollo 11 | 0.67416, 23.47314 | 2026-11-25 18:00 | 266.820877 / 50.282312 | 266.8209 / 50.2823 | 254.125788 / 65.292298 | 254.1258 / 65.2923 | 0.00002° |
| Statio Shiv Shakti | -69.3734, 32.3198 | 2027-01-10 00:00 | 119.775276 / -9.679007 | 119.7753 / -9.6790 | 322.907567 / 15.445851 | 322.9076 / 15.4458 | 0.00005° |
| Nobile Rim 2 | -84.2016, 60.7 | 2026-11-28 09:30 | 250.952192 / -0.402726 | 250.9522 / -0.4027 | 303.302352 / 5.713948 | 303.3024 / 5.7140 | 0.00005° |

**Wniosek:** we wszystkich 6 punktach (biegun, średnie szerokości, równik; Słońce nad i pod horyzontem) różnica ≤ 0,00005°, czyli w granicy zaokrąglenia do 4 miejsc. Rzeczywista zgodność jest co najmniej tak dobra, a test w `src/ephem.rs` pilnuje 0,001°. Dla porównania: tarcza Słońca ma promień ~0,27°, więc błąd efemeryd jest ~5000× mniejszy niż sama tarcza i pomijalny wobec błędu horyzontu z terenu (sekcja 2).

## 2. Horyzont z terenu: co rozdziela DEM 40 m/px

**Podstawa.** Błąd wysokości terenu δh w odległości d daje błąd wysokości horyzontu δθ ≈ δh / d (radiany). Bliski teren ma więc największe znaczenie. **Szacunek:**

| δh \ d | 0,5 km | 1 km | 5 km | 20 km | 100 km |
|---|---|---|---|---|---|
| 1 m | 0,115° | 0,057° | 0,011° | 0,003° | 0,001° |
| 5 m | 0,573° | 0,286° | 0,057° | 0,014° | 0,003° |

- **Dokładność wysokości.** Produkt PGDA 5 m/px dla miejsc lądowania na biegunie (Barker et al. 2021) ma medianę RMS błędu wysokości ~0,30–0,50 m i nachylenia ~1,5–2,5°. Błąd interpolacji zależy głównie od wielkości luk między śladami LOLA, a w drugiej kolejności od nachylenia terenu. Nasz DEM 40 m (`ldem_80s_40m`) jest gładszy i w lukach może mylić się o metry. To **niezweryfikowane liczbowo**: w naszych źródłach nie ma oficjalnej mapy błędów dla 40 m.
- **Rozdzielczość.** Obiekty węższe niż ~2 piksele (~80 m) są uśrednione: małe wzgórza, głazy, ostre grzbiety. Obserwator stoi na średniej wysokości piksela 40 m. Na wąskim grzbiecie (Connecting Ridge, brzeg Shackletona) to zaniża jego wysokość, więc horyzont wychodzi trochę **wyżej**, a oświetlenie trochę **niżej** niż w rzeczywistości.
- **Krzywizna Księżyca** musi być w masce. Teren w odległości d „opada” o kąt d / 2R: 0,08° na 5 km, 0,33° na 20 km, 0,82° na 50 km. Bez tej poprawki odległe góry zasłaniałyby Słońce za mocno. **Szacunek.**
- **Wniosek.** Daleki horyzont (> 5 km), który na biegunie decyduje o Słońcu, DEM 40 m odtwarza do ~0,01–0,06°. Bliski horyzont (< 1 km) to główne źródło błędu, rzędu 0,1–0,3°. W pitchu: **„horyzont dokładny do ok. 0,1°”**.

**Dlaczego 0,1° to dużo na biegunie.** Słońce okrąża horyzont na prawie stałej wysokości. Jego wysokość zmienia się co najwyżej z prędkością cos φ · 360° / 29,53 d. Błąd horyzontu 0,1° przesuwa więc wschód/zachód o (**szacunek**, minimum przy najszybszej zmianie):

| Szerokość | Przykład | Max tempo zmiany wysokości Słońca | Przesunięcie przy błędzie 0,1° |
|---|---|---|---|
| 89,45°S | Shackleton | 0,0049°/h | ~20 h |
| 88,7°S | brzeg de Gerlache | 0,012°/h | ~9 h |
| 85,98°S | Malapert | 0,036°/h | ~3 h |
| 69,37°S | Chandrayaan-3 | 0,18°/h | ~35 min |
| 0,67°N | Apollo 11 | 0,51°/h | ~12 min |

Dlatego na biegunie podajemy **procent czasu i długości okien uśrednione po roku**, a nie dokładne minuty.

## 3. Procent oświetlenia vs literatura

Wartości referencyjne do porównania, gdy maska L2 będzie gotowa. Uwaga na różnice metod: rozdzielczość DEM, okres uśredniania, wysokość nad gruntem i definicja („jakakolwiek część tarczy” vs „średnia część tarczy”).

**Wyniki (L4, serwer L1, main `580c29b`, horyzont `lola:ldem_80s_40m`; rok 2020, krok 1 h).** „Nasze” = `sun_visible_pct` (czas, gdy widać jakąkolwiek część tarczy) / `sun_mean_fraction` (średni ułamek tarczy). „Sfera” = te same zapytania przed maską, horyzont gładki. Wyniki L2 odtworzone niezależnie przez L4, identyczne.

| Punkt (źródło) | lat, lon (E+) | Wysokość | Okres, DEM | Opublikowane | Nasze (teren) | Sfera | Max horyzont |
|---|---|---|---|---|---|---|---|
| **CR1 spot 1: Connecting Ridge (Gläser 2014)** | -89.4395, -137.1934 | 2 m | 19–20 lat, co 1 h, LOLA 20 m/px | 92% czasu w świetle; średnio 88,1% tarczy | **91,1% / 87,4%** ✅ | 59,7% | -0,47° |
| **CR1 spot 3: Connecting Ridge (Gläser 2014)** | -89.4516, -137.2419 | 10 m | jw. | 95,6% czasu; średnio 92,5% | **95,7% / 92,8%** ✅ | 62,2% | -0,86° |
| A: brzeg Shackletona (Bussey 2010) | -89.68, -166.0 | grunt | rok 2020, co 12 h, Kaguya 474 m/px | 81% | 38,9% / 36,3% ⚠️ | 56,3% | 17,4° |
| B: grzbiet przy Shackletonie (Bussey 2010) | -89.44, -141.8 | grunt | jw. | 82% | 34,6% / 32,3% ⚠️ | 57,5% | 12,1° |
| C: brzeg de Gerlache (Bussey 2010) | -88.71, -68.7 | grunt | jw. | 85% | 46,5% / 44,0% ⚠️ | 56,9% | 5,8° |
| D: grzbiet wzdłuż 124,5°E (Bussey 2010) | -88.79, 124.5 | grunt | jw. | 86% | 47,2% / 45,5% ⚠️ | 58,5% | 5,5° |
| M1: Malapert (Bussey 2010) | -86.04, 2.7 | grunt | jw. | 74% | 13,6% / 9,9% ⚠️ | 53,4% | 7,4° |
| M2: Malapert (Bussey 2010) | -86.00, -2.9 | grunt | jw. | 74% | 36,6% / 33,6% ⚠️ | 53,3% | 16,8° |

- **Gläser (LOLA, ten sam typ danych): zgodność ≤ 1 pp** w czasie oświetlenia (91,1 vs 92; 95,7 vs 95,6) i ≤ 0,7 pp w średniej tarczy (87,4 vs 88,1; 92,8 vs 92,5), mimo innego okresu (1 rok vs 19 lat) i rozdzielczości (40 vs 20 m/px). To główny wynik walidacji.
- **Bussey ⚠️ = wrażliwe na współrzędne.** Punkty wyznaczono na DEM Kaguya 474 m/px z inną rejestracją. Przesunięcie o kilkaset metrów zrzuca punkt z grzbietu na zbocze. Widać to po maksymalnym horyzoncie: 5–17° zamiast < 0° na szczycie (dla porównania CR1: -0,5°). To nie jest błąd efemeryd ani maski: na grzbiecie CR1 zgodność jest ≤ 1 pp.
- **Najlepszy punkt w promieniu 500 m** (L2, `/api/best_nearby` z PR #13; **L4 jeszcze nie odtworzył**, endpoint nie działa na serwerze L1):

  | Punkt | Opublikowane | W podanych współrzędnych | Najlepszy ≤ 500 m (odległość) |
  |---|---|---|---|
  | A | 81% | 38,9% | 71,0% (474 m) |
  | B | 82% | 34,6% | 48,6% (472 m) |
  | C | 85% | 46,5% | 76,8% (141 m) |
  | D | 86% | 47,2% | 60,4% (180 m) |
  | M1 | 74% | 13,6% | 61,7% (255 m) |
  | M2 | 74% | 36,6% | 41,4% (450 m) |

  Kilkaset metrów zmienia wynik nawet o 48 pp. W M2 Ziemi nie widać wcale (0%), bo zasłania ją szczyt Malaperta ~1,2 km na północ i ~230 m wyżej (L2). Pozostała różnica do wartości Busseya to inna rejestracja i rozdzielczość DEM (474 m vs 40 m) oraz inna metoda.
- **Teren zmienia wynik w obie strony:** sfera daje ~53–62% wszędzie, a teren od 13,6% (M1, pod szczytem Malaperta) do 95,7% (CR1, 10 m). Miejsce z testu Horizons (-89.45, -129.78): **36,1%** w roku 2020 z terenem; 48,1% przez 30 dni od 14.11.2026.

- Dla punktu D Bussey et al. 2010 podają w Tabeli 2 88,79°S, w abstrakcie 88,74°S, a w tekście 99,79°S (literówka). Używamy tabeli.
- Gläser podaje długości 0–360°E; przeliczone na -180..180, np. 222,8066°E = -137,1934°.
- Według Bussey punkty A i B razem: przez > 94% czasu oświetlony jest przynajmniej jeden z nich.
- Mazarico et al. 2011 (Icarus 211, 1066; DEM LOLA 240 m, cykl 18,6 roku): wartości dla punktów **jeszcze nie wyciągnięte**, bo PDF NASA jest nieczytelny na L4. To z tej pracy pochodzi metoda horyzontu, której używa Gläser i nasz `horizon.rs` (720 azymutów co 0,5°).

**Zapytania do porównania** (rok 2020 jak u Bussey; 366 d × 24 = 8784 punktów, poniżej limitu 20 000). Bierzemy `summary.sun_visible_pct` i `summary.sun_mean_fraction`:
```
/api/track?lat=-89.68&lon=-166.0&start=2020-01-01&days=366&step_min=60
/api/track?lat=-89.44&lon=-141.8&start=2020-01-01&days=366&step_min=60
/api/track?lat=-88.71&lon=-68.7&start=2020-01-01&days=366&step_min=60
/api/track?lat=-88.79&lon=124.5&start=2020-01-01&days=366&step_min=60
/api/track?lat=-86.04&lon=2.7&start=2020-01-01&days=366&step_min=60
/api/track?lat=-86.00&lon=-2.9&start=2020-01-01&days=366&step_min=60
/api/track?lat=-89.4395&lon=-137.1934&start=2020-01-01&days=366&step_min=60&alt_m=2
/api/track?lat=-89.4516&lon=-137.2419&start=2020-01-01&days=366&step_min=60&alt_m=10
```
Oczekiwanie: zgodność do kilku punktów procentowych. Nasz DEM 40 m jest dokładniejszy niż 474 m z Kaguyi, ale okres jest inny (1 rok vs 19 lat u Gläsera).

## 4. Budżet błędu z przybliżonych współrzędnych (regiony Artemis)

NASA nie publikuje środków regionów. Nasze punkty proxy (`sites.json`, pole `coord_note`) mogą być przesunięte o kilka do kilkudziesięciu km. **Szacunek:**
- **Geometria.** Przesunięcie o 1 km pochyla lokalny pion o 0,033°, czyli 10 km to 0,33°, a 30 km to 0,99°. O tyle (zależnie od kierunku) zmienia się wysokość Słońca i Ziemi. Na biegunie Słońce stoi na ±1,5°, więc to porównywalne z samym sygnałem.
- **Teren.** Przesunięcie o > 1 km zmienia cały bliski horyzont (inne wzgórza i krawędzie kraterów). Grzbiet i dno pobliskiego krateru to ~80% vs 0% oświetlenia (sekcja 3, Bussey 2010).
- **Przykład z naszych danych: Haworth.** Stary proxy (środek krateru wg USGS, -87.45, -5.17) leży na dnie, w wiecznym cieniu. Z maską LOLA wychodzi 0% Słońca i 0% Ziemi, a horyzont ma 3,6–11,1° dookoła. Nowy proxy (środek mozaiki LROC dla regionu Haworth, -86.75, -23.67, ~25 km dalej) daje 31,1% Słońca i 21,0% Ziemi (rok 2020, krok 1 h). Ten sam „region” różni się więc o cały zakres skali, zależnie od wybranego punktu.
- **Wniosek.** Dla regionów Artemis pokazujemy wynik jako **„przykładowy punkt w regionie”**, nie jako cały region. Błąd lokalizacji dominuje nad resztą: efemerydy 0,0001°, DEM ~0,1°, lokalizacja ~0,3–1°. W UI warto dopisać „approximate location”.

## 5. Efekty pomijane lub uproszczone i ich wielkość

| Efekt | Wielkość | Jak u nas |
|---|---|---|
| Refrakcja | 0 (brak atmosfery) | Pominięta, poprawnie; Horizons też bez refrakcji dla Księżyca |
| Libracja (Ziemia „kiwa się” po niebie) | do kilku stopni elewacji Ziemi | **Uwzględniona**: orientacja Księżyca z DE440 (`moon_pa_de440_200625`); zgodność z Horizons w sekcji 1 |
| Czas świetlny i aberracja | małe | Uwzględnione pośrednio (zgodność z pozycjami „apparent” z Horizons do 0,0001°) |
| Wysokość panelu/anteny (`alt_m`) | obniżenie horyzontu sferycznego: 2 m to 0,087°, 10 m to 0,19°. Z terenem efekt większy: Connecting Ridge 92,3% (2 m) vs 95,66% (10 m) czasu w świetle (Gläser 2014) | Parametr `alt_m` w API |
| Tarcza Słońca vs punkt | promień ~0,27° | **Uwzględniona**: `disk_fraction_above` w `horizon.rs` liczy ułamek tarczy nad horyzontem |
| Tarcza Ziemi vs punkt | promień ~0,9–1,0° | Uwzględniona tak samo; dla DTE jest też margines anteny `dte_margin_deg` |
| Zaćmienia Słońca przez Ziemię (zaćmienia Księżyca) | kilka godzin rocznie | **Pominięte** (potwierdził L2). Zawyża oświetlenie o ułamek punktu procentowego |
| Krok czasu (`step_min`) | ±½ kroku na granicach okien | Wybór użytkownika; do statystyk rocznych wystarczy 60 min |

## 6. Tabela do pitchu (EN)

| What | How exact | How we know |
|---|---|---|
| Sun & Earth position | ≤ 0.0001° | 6 spot checks vs NASA JPL Horizons (pole, mid-latitude, equator) + automated test |
| Terrain horizon | ~0.1° (far terrain ~0.01–0.06°) | LRO LOLA 40 m/px DEM; error analysis vs the 5 m/px PGDA product (Barker et al. 2021) |
| Sunlit % at south-pole sites | within 1 percentage point of published LOLA results (Connecting Ridge: 91.1% vs 92%, 95.7% vs 95.6%) | Gläser et al. 2014; older 474 m Kaguya points (Bussey et al. 2010) are coordinate-sensitive |
| Why terrain matters | smooth sphere: ~55–62% sunlight everywhere; real terrain: 14% to 96% | Same year (2020), same sites, LOLA 40 m/px horizon on vs off |
| Artemis region locations | approximate (km scale) | NASA publishes region names, not centre points; marked as approximate in the app |

## Źródła

- JPL Horizons API: https://ssd.jpl.nasa.gov/api/horizons.api
- Barker, M.K., Mazarico, E., Neumann, G.A. et al. (2021). Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. *Planet. Space Sci.* 203, 105119. doi:10.1016/j.pss.2020.105119. Produkt: https://pgda.gsfc.nasa.gov/products/78
- Bussey, D.B.J. et al. (2010). Illumination conditions of the south pole of the Moon derived using Kaguya topography. *Icarus* 208, 558–564. doi:10.1016/j.icarus.2010.03.028 (Tabela 2)
- Gläser, P. et al. (2014). Connecting Ridge: A landing site at the lunar south pole with extended illumination. EPSC Abstracts 9, EPSC2014-136-1. https://elib.dlr.de/94242/1/EPSC2014-136-1.pdf
- Mazarico, E. et al. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus* 211, 1066–1081. doi:10.1016/j.icarus.2010.10.030
