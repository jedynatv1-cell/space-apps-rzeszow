# Wyzwanie: Lunar Landing Site Navigator

- **Link:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- **Poziom:** Advanced / Intermediate
- **Tematy:** Human Exploration, Moon, Software, Space Exploration
- **Termin hackathonu:** 14–15 listopada 2026 (Rzeszów, wydarzenie hybrydowe)

> Pokrewne wyzwanie (gdybyśmy chcieli zmienić): *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

## Problem w jednym zdaniu

Planiści misji na biegun południowy Księżyca muszą szybko ocenić, **czy dane miejsce i data lądowania dają wystarczająco Słońca (zasilanie) i widoczność Ziemi (łączność bezpośrednia)**, a istniejące narzędzia (Quickmap, Moon Trek, JPL Horizons) są zbyt skomplikowane do szybkiego porównywania scenariuszy.

## Dlaczego to trudne

- Na biegunie Słońce i Ziemia krążą tuż przy horyzoncie — kilka stopni terenu decyduje o cieniu lub braku łączności.
- Brak atmosfery = brak refrakcji; horyzont to **teren (LOLA) + krzywizna Księżyca**.
- Libracja powoduje, że Ziemia „kiwa się” przy horyzoncie i okresowo znika.
- Opóźnienia misji (CLPS) zmuszają do szybkiego przeliczenia innych dat i miejsc.

## Cele z opisu wyzwania (wszystkie opcjonalne — „you may consider”)

- [ ] **Wybór i porównanie miejsc**: lista znanych miejsc (Apollo, CLPS, misje komercyjne, inne kraje) + własne współrzędne; porównanie obok siebie
- [ ] **Elastyczna data/czas**: wybór daty, zmiany w ciągu dni księżycowych i pór roku
- [ ] **Pozycja Słońca i Ziemi względem horyzontu** w wybranym miejscu i czasie; czas do zachodu Słońca / zachodu Ziemi
- [ ] **Ocena zasilania i łączności**: wysokość Słońca, czas nasłonecznienia, okna widoczności Ziemi
- [ ] **Różne wizualizacje**: mapa 2D, powierzchnia 3D lub inne
- [ ] **Dynamika w czasie**: animacje / oś czasu przez dzień księżycowy
- [ ] **Dostępność**: dla ekspertów i dla laików/edukacji

## Dane i zasoby (oficjalne)

| Zasób | Do czego | Link |
|---|---|---|
| JPL Horizons | Efemerydy — azymut/wysokość Słońca i Ziemi z punktu na Księżycu | https://ssd.jpl.nasa.gov/horizons/ |
| LROC Quickmap | Obrazy i topografia LRO, eksploracja miejsc | https://quickmap.lroc.asu.edu/ |
| Moon Trek | Wizualizacja 3D, topografia | https://trek.nasa.gov/moon/ |
| LOLA (Lunar Orbiter Laser Altimeter) | DEM do liczenia horyzontu | szczegóły w [RESEARCH.md](RESEARCH.md) |
| CSA Moon Exploration | Kontekst misji | https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ |

Szczegóły techniczne, gotowe zapytania API, lista miejsc lądowania i plan MVP → [RESEARCH.md](RESEARCH.md).

## Nasze rozwiązanie (MVP)

Co **musi** działać na demo:

1. Wybór miejsca (lista + własne współrzędne) i daty
2. Wykres nieba / panorama horyzontu z pozycją Słońca i Ziemi
3. Oś czasu: kiedy Słońce i Ziemia są nad horyzontem + kluczowe metryki
4. Porównanie co najmniej 2 scenariuszy obok siebie

Co fajnie by było mieć, jeśli starczy czasu:

- Horyzont z prawdziwego terenu LOLA (zamiast gładkiej kuli)
- Widok 3D terenu
- Tryb edukacyjny („dlaczego biegun jest trudny?”)

## Pytania otwarte

- Horizons online vs. efemerydy liczone lokalnie w Ruście — decyzja po researchu
- Jaka rozdzielczość DEM wystarczy i ile danych pobrać przed startem
