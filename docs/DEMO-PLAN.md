# Plan nagrania i prezentacji

## 0. Harmonogram Rzeszów (✅ ze strony wydarzenia, zakładka „Local Event Schedule”)

| Kiedy | Co |
|---|---|
| sob 14.11, 09:00 | Rejestracja (PCI ProtoLab, ul. Lenartowicza 6) |
| sob 14.11, 10:00 | Otwarcie, brief, team building |
| sob 14.11, 17:00 | Koniec pracy na miejscu w dniu I (można pracować dalej zdalnie) |
| nd 15.11, 09:00 | Start dnia II na miejscu |
| **nd 15.11, 12:59** | **Zgłoszenie do oceny LOKALNEJ** ⚠️ |
| nd 15.11, 13:00 | Ocena lokalna |
| nd 15.11, 16:00 | Ogłoszenie wyników i nagrody lokalne (pula 5000 zł) |
| nd 15.11, 17:00 | Koniec pracy na miejscu |
| nd 15.11, 23:59 | Zgłoszenie do oceny GLOBALNEJ |

**Wniosek:** prawdziwy deadline to **niedziela 12:59**, a nie 23:59. Demo musi być gotowe przed południem w niedzielę.
Do zapytania organizatora (hackathon@pcinn.org, Kacper Moczarny):
1. Jak wygląda ocena lokalna o 13:00: pitch na żywo? Ile minut? Projektor/HDMI?
2. Czy po zgłoszeniu o 12:59 można jeszcze poprawiać stronę projektu i wideo przed globalnym 23:59?

## 1. Kamera czy samo nagranie aplikacji?

**Rekomendacja: nie bierzcie kamery. Nagranie ekranu aplikacji + napisy (+ opcjonalnie głos).**

| | Samo nagranie ekranu | Kamera / twarze |
|---|---|---|
| Czas w 30 s | Każda sekunda pokazuje produkt | 2–5 s na „kim jesteśmy” zjada ~15% filmu |
| Ocena (*Presentation*, *Validity*) | Pokazuje działające narzędzie i prawdziwe liczby | Nic nie dodaje do oceny projektu |
| Regulamin | Bez ryzyka | **Nie wolno pokazać osób < 18 lat**; dorośli tylko za zgodą |
| Logistyka | Zero sprzętu, da się nagrać ponownie skryptem | Światło, dźwięk w hałaśliwej sali, nagrywanie ponownych ujęć |
| Poprawki po zmianie UI | Uruchamiasz skrypt jeszcze raz | Trzeba nagrywać od nowa |

Jeśli chcecie ludzkiego akcentu: **2 sekundy z telefonu** (zdjęcie zespołu albo krótkie ujęcie przy stanowisku, tylko osoby pełnoletnie) wystarczą na ujęcie 0:00–0:02. Telefon w zupełności wystarczy, dedykowana kamera nic tu nie da.

Na **pitch lokalny na żywo** kamera też nie jest potrzebna: laptop + HDMI + aplikacja działająca **offline** (kernele i DEM lokalnie) + wideo zapasowe na pendrive.

## 2. Nagrywanie „bez rąk” → DaVinci → poprawki ręczne

Cel: jedno polecenie nagrywa wszystkie sceny, generuje napisy i gotową oś czasu, którą otwierasz w DaVinci i tylko szlifujesz. Gdy UI się zmieni, uruchamiasz polecenie jeszcze raz.

```
scripts/demo/scenes.json  ──▶  scripts/demo/record.mjs (Playwright)
   (lista scen: akcje w UI,       │  steruje aplikacją w Chromium 1920×1080,
    czas, napis EN)                │  nagrywa każdą scenę jako osobny klip
                                   ▼
                   out/demo/01_title.webm, 02_shackleton.webm, ...
                   out/demo/captions.srt      (napisy EN z scenes.json)
                   out/demo/timeline.fcpxml   (klipy po kolei + markery scen)
                                   │
                                   ▼
        DaVinci Resolve: File → Import → Timeline → timeline.fcpxml
                         File → Import → Subtitle → captions.srt
                                   │
                                   ▼
        Ręcznie: przycięcia, dynamic zoom na kluczowe liczby, muzyka,
        kolor, sprawdzenie ≤ 30 s → Deliver: 1080p H.264 MP4
```

### Dlaczego tak
- **Playwright** (Node jest już zainstalowany) daje powtarzalne, gładkie nagranie: kursor zawsze trafia, nie ma literówek, każde ujęcie trwa dokładnie tyle samo. Ręczne nagrywanie zwykle kończy się 10 podejściami.
- **FCPXML zamiast skryptowania DaVinci:** import osi czasu (FCPXML/EDL/OTIO) działa też w **darmowym** DaVinci. Skryptowe API Resolve (Python) z zewnątrz działa podobno tylko w wersji Studio; w darmowej skrypty da się uruchamiać z menu *Workspace → Scripts*. **Do sprawdzenia** na Waszej wersji, ale FCPXML omija ten problem.
- Klipy i napisy są osobno, więc w DaVinci wszystko da się poprawić ręcznie: nic nie jest „wypalone” na stałe.

### Do zainstalowania na maszynie do nagrań
```bash
npm i -D playwright
npx playwright install chromium
```
ffmpeg jest opcjonalny (konwersja webm → mp4, gdyby DaVinci kręcił nosem na webm; zwykle nie trzeba).
Plan awaryjny bez skryptu: **Win + Alt + R** (Xbox Game Bar nagrywa okno przeglądarki) albo OBS.

### Skrypty
`scripts/demo/record.mjs` i `scenes.json` piszemy, **gdy UI się ustabilizuje** (nd ~10:00, po feature freeze). Wcześniej nagranie i tak by się zdezaktualizowało.

## 3. Scenariusz wideo (≤ 30 s, wg oficjalnego szablonu)

| Czas | Obraz | Napis (EN) |
|---|---|---|
| 0:00–0:02 | Plansza tytułowa / zdjęcie zespołu | *Team <nazwa> · NASA Space Apps Rzeszów 2026* |
| 0:02–0:05 | Biegun płd. Księżyca (obraz LRO/Quickmap, z podaniem źródła) | *At the lunar south pole, the Sun and Earth skim the horizon.* |
| 0:05–0:10 | Ekran startowy aplikacji | *<Nazwa>: compare landing sites and dates in seconds.* |
| 0:10–0:15 | Shackleton: przełącznik teren wył./wł., Słońce chowa się za grzbietem | *Real LOLA terrain decides power and comms.* |
| 0:15–0:20 | Klik „slip +7 d”: metryki się zmieniają, Earthset się przesuwa | *Launch slipped a week? See the impact instantly.* |
| 0:20–0:25 | Porównanie 2–3 miejsc obok siebie | *Validated against NASA JPL Horizons to 0.001°.* |
| 0:25–0:30 | Plansza końcowa | *For mission planners, educators and everyone curious.* |

Zasady: wszystko po angielsku (głos może być po polsku, ale wtedy napisy EN są obowiązkowe). **Bez logo NASA.** Jeśli głos lub muzyka są z AI, trzeba to zaznaczyć w opisie i metadanych. Muzyka tylko na wolnej licencji i z wpisem w *References*. Film wrzucamy na YouTube jako **niepubliczny (unlisted)**: link działa bez logowania.

Alternatywa dopuszczona przez regulamin: **≤ 7 slajdów**. Warto mieć oba formaty, bo slajdy przydadzą się też na pitch lokalny.

## 4. Plan na niedzielę

| Godzina | Co | Kto |
|---|---|---|
| 09:00–10:00 | Ostatnie poprawki, merge do `main`, CI zielone | wszyscy |
| **10:00** | **Feature freeze**: w `main` tylko poprawki błędów | — |
| 10:00–10:45 | `record.mjs` + `scenes.json`, nagranie automatyczne | E + Claude |
| 10:45–11:45 | DaVinci: import FCPXML + SRT, szlif, eksport, YouTube | E |
| 11:00–12:15 | Strona projektu: opis, NASA Data, Use of SI, linki | ktoś drugi |
| 12:15–12:40 | Test linków w oknie incognito, repo publiczne | E |
| **12:40** | **Submit** (zapas 19 min przed 12:59) | E |
| 13:00 | Pitch lokalny: demo na żywo + wideo zapasowe | całość |
