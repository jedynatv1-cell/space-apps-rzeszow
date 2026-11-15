# Plan współpracy: 6 laptopów, 1 limit Claude, agenci, którzy ze sobą rozmawiają

> **Status: PROPOZYCJA do przejrzenia** (sob 14.11 ~11:45). Decyzje są podjęte za Ciebie, z uzasadnieniem. Zmieniasz je w jednym miejscu: `.claude/roles.json`.

## 0. Decyzje w skrócie

| Pytanie | Decyzja | Dlaczego |
|---|---|---|
| Czy każdy PC trzyma repo? | **Tak, każdy ma klon tego samego repo z GitHuba.** | Wszyscy widzą ten sam `main`. Różnice żyją tylko na gałęziach, dopóki L1 ich nie scali. |
| Jak repo zostaje „takie samo”? | Hook na starcie każdej sesji pokazuje, ile brakuje do `main`. Skill **`/sync`** to nadrabia. L1 scala co ~1,5 h. | Ręczne pilnowanie zawodzi; automat nie zapomina. |
| Ile czatów Claude? | **Sobota: 3** (L1 i L2 ciężko, L4 lekko). **Niedziela: +1 na L6.** Naraz pracują **maks. 2**. | Jeden limit dla wszystkich: każdy równoległy czat zjada go tak samo. |
| Kto robi frontend? | **Antigravity na L3** (słaby laptop wystarczy). | HTML/JS nie wymaga kompilacji, Antigravity ma osobny limit (Google), a serwer stoi na L1. |
| Gdzie stoi aplikacja? | **Jeden serwer na L1** (`cargo run`), reszta przez `http://<IP-L1>:3000`. Tailscale tylko, gdy Wi-Fi blokuje połączenia między laptopami (test: [START-PC.md](START-PC.md)). | Tylko L1 potrzebuje 620 MB danych i kompilacji Rusta. |
| Jak agenci rozmawiają? | **Remote Control włączony w każdej sesji Claude** + `SendMessage`. Antigravity przez Dziennik (§8). | Wiadomość od razu trafia do właściwego laptopa, a Dziennik zostaje źródłem prawdy. |
| Co pilnuje struktury? | **Hooki** (`.claude/settings.json`): agent nie edytuje cudzych plików, nie pushuje na `main`, nie robi force-push/stash/reset. | Działa automatycznie w każdej sesji Claude na każdym PC, bo jest w repo. |

## 1. Sprzęt i role

| Laptop | Maszyna | Strumienie pracy (z `roles.json`) | Narzędzie AI | Gałąź |
|---|---|---|---|---|
| **L1** | 💪 mocny | **CORE = KOORDYNATOR**: centrala komunikacji botów (wiadomości, Dziennik, aktualność dokumentów), przydział pracy, merge PR-ów, serwer. **Nie pisze kodu funkcji.** | Claude (koordynator) | `main` + krótkie gałęzie `chore/*` |
| **L2** | 💪 mocny | **W1** teren: czytnik LOLA DEM (✅ gotowy na `feat/terrain`), maska horyzontu + **W2** metryki i API: earthrise, `/api/compare`, walidacja PGDA | Claude (ciężko) | `feat/terrain`, `feat/metrics` |
| **L3** | 🪶 słaby | **W3** frontend: sky-plot, panorama, porównanie obok siebie | Antigravity | `feat/ui` |
| **L4** | 🪶 słaby | **W4 research + dokładność**: jak dokładne są nasze liczby (efemerydy vs JPL Horizons, horyzont/oświetlenie vs mapy PGDA, błąd od rozdzielczości DEM i współrzędnych proxy), tabela walidacji do pitchu (`docs/VALIDATION.md`), `sites.json`, teksty strony projektu (EN) | Claude (średnio) | `feat/content` |
| **L5** | 🪶 słaby | **QA**: testy na serwerze L1, zgłaszanie błędów, linki w trybie incognito + **W5** w sobotę: szkic slajdów i skryptu nagrania | Claude (lekko) / człowiek | `feat/demo` |
| **L6** *(od niedzieli)* | 💪 mocny | **W5** media: skrypt nagrywający, DaVinci, 7 slajdów, pitch | Claude (skrypt) | `feat/demo` |
| **R1** komputer zdalny (Google Remote Desktop) | 💪 zajęty | **NIE w projekcie.** Trenuje model PPO w osobnej sesji Claude („Sieć neuronowa do przewidywania…”). Nie klonujemy tu repo i nie wysyłamy wiadomości. | — | — |

**Równy podział:** szacunki godzin w `roles.json` (`effort_h`). Mocne laptopy biorą Rusta (~7–8 h każdy), L3 frontend (~6 h), słabe laptopy lżejsze zadania plus pitch i slajdy, które robią ludzie.

**Przełączenie na 6 laptopów (nd rano):** L1 zmienia `"laptops": 5` → `6` w `.claude/roles.json`, commit na `main`. W5 automatycznie przechodzi z L2 na L6.

**ID komputerów:** L1–L6 to laptopy projektu, R1 to komputer zdalny (wyłączony). ID wpisuje się w `.claude/role.local.json` (`/setup-laptop`) i w nazwie Tailscale (`laptop-l1` … `laptop-l6`). Ten sam numer występuje w wiadomościach `[L2→L3]` i w Dzienniku.

**Do uzupełnienia:** kto siedzi przy którym laptopie (tabela §2).

## 2. Urządzenia (uzupełnijcie)

| Laptop | Osoba | Nazwa w Tailscale | System | Ma `data/raw/`? | Remote Control | Uwagi |
|---|---|---|---|---|---|---|
| L1 | … | `laptop-l?` | … | ✅ wymagane | ✅ | jedyny serwer, integrator |
| L2 | … | `laptop-l?` | … | opcjonalnie | ✅ | własny serwer testowy na `PORT=3001` |
| L3 | … | `laptop-l?` | … | ❌ | — (Antigravity) | frontend → `http://<L1>:3000` |
| L4 | … | `laptop-l?` | Windows 10 | ❌ | ✅ | treści (W4), gałąź `feat/content` |
| L5 | … | `laptop-l?` | … | ❌ | ✅ (podgląd sesji L1/L2) | |
| L6 | … | `laptop-l?` | … | opcjonalnie | ✅ | od niedzieli |
| R1 | — | — | … | ❌ | ❌ | zajęty treningiem PPO, poza projektem |

## 3. Repo na każdym komputerze

```
               GitHub: main  ← tylko L1 scala PR-y (zielone CI)
      ┌──────────┬──────────┬──────────┬──────────┬──────────┐
     L1         L2         L3         L4         L5         L6
 feat/terrain feat/metrics feat/ui feat/content  (main,     feat/demo
   + main                                       tylko odczyt)
```

**Konfiguracja raz na każdym PC (~5 min):** kroki, prompty startowe i nazwy czatów są w [START-PC.md](START-PC.md).
```bash
gh repo clone jedynatv1-cell/space-apps-rzeszow navigator
cd navigator
```
Potem otwórz w tym folderze Claude Code i wpisz **`/setup-laptop`**. Skill zapyta o numer laptopa, zapisze `.claude/role.local.json` (nie trafia do gita), sprawdzi narzędzia, przełączy na właściwą gałąź i zaproponuje włączenie Remote Control.

- **Każdy PC ma Node** (hooki są w Node). Rust tylko na mocnych.
- **`data/raw/`** tylko na L1 (+ ewentualnie L2/L6). Przesyłanie przez Taildrop (§7), potem sprawdzenie rozmiarów z HANDOFF §2.
- **Worktree nie są potrzebne:** każdy agent ma własny komputer. Wyjątek: dwa agenty na jednej maszynie (wtedy `git worktree add`).

**Rytm synchronizacji:**
1. Start pracy: hook pokazuje „N behind” → **`/sync`**.
2. Skończony kawałek: **`/ship`** (verify → commit swoich plików → push gałęzi → PR → wpis w Dzienniku → wiadomość do laptopów, których to dotyczy).
3. **L1 scala co ~1,5 h** (13:30, 15:00, 16:30, wieczorem) i wysyła `[L1→all] main updated … Run /sync`.

## 4. Limit Claude: zasady

1. **Maks. 2 czaty Claude pracują naraz.** Pierwszeństwo ma ścieżka krytyczna: W1 teren (L2). Czat koordynatora na L1 jest lekki (tylko wiadomości i merge). Pozostali czekają albo robią swoją część ręcznie.
2. **Jeden czat na laptop, prowadzony długo.** Nowy czat zakładamy tylko przy zmianie tematu, bo ciągnięcie historii jest tańsze niż tłumaczenie wszystkiego od nowa. Nowy czat i tak dostanie kontekst z CLAUDE.md, HANDOFF i hooka startowego.
3. **Bez subagentów i workflow** (wieloagentowe tryby mnożą zużycie). Nie wpisujcie słowa „ultracode”.
4. **Słabe laptopy nie zakładają własnych ciężkich czatów.** Przez Remote Control podglądają i kierują sesjami L1/L2, co nie kosztuje dodatkowego limitu.
5. Krótkie polecenia, bez wklejania wielkich logów. Zużycie sprawdzajcie w aplikacji Claude co parę godzin.
6. **Ten czat (koordynator) po starcie można zarchiwizować.** Rolę koordynatora przejmuje czat na L1.

## 5. Jak agenci rozmawiają

**Zasady obowiązkowe (pełna wersja: CLAUDE.md „Team rules”):**
1. **L1 = koordynator, nie programista.** Czat na L1 służy tylko do komunikacji między botami: odbiera i przekazuje wiadomości, prowadzi Dziennik i HANDOFF, przydziela pracę, scala PR-y, restartuje serwer. Nie edytuje `src/`, `web/`, `data/`.
2. **Boty rozmawiają ze sobą bezpośrednio i zawsze dają znać L1** (`[Lx→L1]`): na starcie zadania, przy blokadzie i po `/ship`. Potrzebujesz zmiany w cudzym pliku? Wiadomość do właściciela (cc L1), nigdy edycja.
3. **Dokumenty aktualne w tym samym PR.** Zmiana zachowania, API, konfiguracji lub statusu = aktualizacja dokumentu w tym samym PR (HANDOFF przez wiadomość do L1, bo L1 jest jego właścicielem) + wiersz w Dzienniku. PR bez zmian w dokumentach musi mieć w opisie „Docs: none needed because …”. L1 takich PR-ów nie scala.

**Ustawienia na każdym laptopie z Claude** (plik `~/.claude/settings.json`; skill `/setup-laptop` zaproponuje):
```json
{ "remoteControlAtStartup": true, "crossSessionInbound": "accept" }
```
- `remoteControlAtStartup`: każda sesja jest od razu widoczna dla pozostałych sesji tego konta (także na innych komputerach).
- `crossSessionInbound: "accept"`: wiadomości od innych sesji docierają. Bez tego mogą być „zatrzymane do akceptacji”, gdy laptopy mają różne tryby uprawnień. Bezpieczne tylko dlatego, że wszystkie laptopy to jedno konto.

**Format wiadomości** (agent wysyła przez `SendMessage`, a odbiorcę znajduje przez `ListAgents`):
```
[L2→L3] PR #12 merged: /api/track ma nowe pole summary.next_earthrise (ISO lub null). Pull main; nic nie znika.
[L1→all] main updated (a1b2c3d): maska horyzontu z LOLA dla ≤ -80°. Run /sync. Serwer zrestartowany.
[L3→L2] Prośba: potrzebuję /api/compare?ids=1,5,7 zwracającego listę summary. Kiedy?
```
- Wiadomość to **informacja, nie rozkaz**. Agent-odbiorca pyta swojego człowieka, zanim zrobi coś poza swoimi plikami.
- **Każda ważna wiadomość ma też wiersz w Dzienniku §8.** Antigravity (L3) nie odbiera `SendMessage`, więc czyta Dziennik, a osoba przy L3 dostaje info od innych.
- **Kontrakt API (HANDOFF §5) jest zamrożony:** pola wolno dodawać, nie wolno zmieniać nazw ani usuwać.

## 6. Co pilnuje struktury (automatycznie)

| Mechanizm | Plik | Co robi |
|---|---|---|
| Hook startowy | `.claude/hooks/session-start.mjs` | Na początku każdej sesji: który to laptop, jakie pliki wolno edytować, ile brakuje do `main`, 3 ostatnie wpisy z Dziennika, ostrzeżenie „słaby laptop, nie kompiluj” |
| Ochrona plików | `.claude/hooks/guard-ownership.mjs` | Blokuje edycję cudzych plików, nieprzypisanych nowych plików i `data/raw/`; mówi, czyj to plik i jak poprosić |
| Ochrona gita | `.claude/hooks/guard-git.mjs` | Blokuje push na `main` (poza L1), force-push, `stash`, `reset --hard`, `clean -f`, `add data/raw`, `--no-verify` |
| Skille | `.claude/skills/` | `/setup-laptop`, `/sync`, `/verify`, `/ship` |
| CI | `.github/workflows/ci.yml` | fmt, clippy, testy na każdym PR |

- Hooki działają **tylko w Claude**. Antigravity ich nie widzi, więc jego zasady są w `AGENTS.md`, a pilnuje ich osoba przy L3 plus CI.
- Bez `role.local.json` ochrona plików jest **wyłączona** (żeby nie blokować przed konfiguracją), a hook startowy o tym ostrzega.
- Wyjątek „na życzenie”: `"override": true` w `role.local.json` wyłącza ochronę plików na tym laptopie. Tylko świadomie.
- Nowy plik (np. `src/compare.rs`): najpierw L1 dopisuje go do `owns` w `roles.json`.
- Zmiany w hookach i ustawieniach działają od **następnej** sesji.

## 7. Sieć: Tailscale (OPCJONALNIE, tylko gdy `http://<IP-L1>:3000` nie działa z innych laptopów)

**Po co:** Wi-Fi na wydarzeniu często izoluje klientów (laptopy nie widzą się nawzajem). Tailscale to omija, w razie potrzeby przez serwery pośredniczące: wolniej, ale działa.

1. Jedna osoba zakłada konto Tailscale.
2. W panelu admina (*Settings → Keys*) generuje **reusable + ephemeral auth key** ważny 1–2 dni. Ephemeral usuwa urządzenie po dłuższym offline; po uśpieniu laptopa wystarczy ponownie uruchomić polecenie z pkt 3.
3. Na każdym PC: `tailscale up --authkey=<KLUCZ> --hostname=laptop-<imie>`.

> ⚠️ **Klucz to sekret.** Nie trafia do repo, dokumentów ani czatów z AI. Przekazujcie go prywatnie, a po wydarzeniu unieważnijcie (panel → Keys → Revoke).

- **Serwer:** na L1 `cargo run`, a reszta otwiera `http://laptop-<imie-L1>:3000` (MagicDNS). Serwer nasłuchuje na `0.0.0.0` z otwartym CORS. Windows zapyta o zgodę zapory: zezwolić.
- **`data/raw/` (~620 MB)** przesyłamy przez Taildrop (urządzenia jednego konta), potem sprawdzamy rozmiary z HANDOFF §2.
- Tailscale **nie zastępuje** logowania do GitHuba, Claude, Antigravity ani spaceappschallenge.org.
- Darmowy plan ma limit użytkowników (sprawdź tailscale.com/pricing). Jedno konto z auth key to jeden użytkownik, więc limit nie przeszkadza.

## 8. Plan dnia

**Sobota**
| Kiedy | L1 💪 | L2 💪 | L3 🪶 | L4 🪶 | L5 🪶 |
|---|---|---|---|---|---|
| do 12:15 | clone, `/setup-laptop`, Tailscale, `data/raw/`, `cargo run` | clone, `/setup-laptop`, Tailscale | clone, Antigravity w repo, Tailscale | clone, `/setup-laptop` | clone, Tailscale, otwiera serwer L1 |
| 12:15–17:00 | koordynacja: wiadomości, Dziennik, HANDOFF, serwer | W1: maska horyzontu (czytnik DEM ✅), potem W2: earthrise, `/api/compare` | W3: sky-plot + porównanie (na danych z serwera L1) | W4: rozsunięcie regionów Artemis, szkic tekstów EN | QA: klikanie, lista błędów w Dzienniku, szkic slajdów |
| 13:30 / 15:00 / 16:30 | **merge PR-ów** | `/ship` | `/ship` (przez osobę) | `/ship` | — |
| 17:00 | wyjście z PCI; serwer na noc = **L1 w domu** (Tailscale działa dalej) | | | | |
| wieczór | merge, pilnowanie dokumentów | cel: **maska horyzontu na `main` do 20:00**, potem walidacja PGDA | dopieszczanie UI | teksty strony projektu | — |

**Niedziela**
| Kiedy | Co |
|---|---|
| 09:00 | L6 dołącza: `/setup-laptop`, L1 ustawia `"laptops": 6` |
| 10:00 | **Feature freeze**: w `main` tylko poprawki |
| 10:00–11:45 | L6: skrypt nagrywający + DaVinci (`docs/DEMO-PLAN.md`). L4: strona projektu. L5: test linków w trybie incognito |
| 12:15 | repo publiczne (L1) |
| **12:40** | **Submit** (lokalny deadline 12:59) |
| 13:00 | pitch na żywo z L1 + wideo zapasowe |

## 9. Dziennik (dopisuj na górze)

| Kiedy | Kto | Co | Wpływ na innych |
|---|---|---|---|
| nd 15.11 ~10:05 | L3 (Claude) | `solar.html` (pierwsza poprawka po freeze, za zgodą L1): przy starcie widać tylko regiony kandydackie (`?show=all` włącza wszystko), każde miejsce jako obszar (historyczne ~1 km, ilustracyjnie; utracone na czerwono), ikony rakiet w kolorze kategorii; wysokość przylotu i chowanie ikony zależne od rozmiaru obszaru. `?v=20261115j` | L6: do nagrania `solar.html?show=all` |
| nd 15.11 ~09:35 | L1 (Claude) | `docs/ENDGAME-HANDOFF.md`: samodzielny handoff dla Antigravity, zadania L1–L6 po kolei, terminy, zasady, stan po PR #46, kontrakt `/api/moon_predict`, scenariusz wideo | Każdy laptop: czytaj swoją sekcję §4 i działaj sam. Wyjątek od freeze: `/api/moon_predict` do 11:00 |
| nd 15.11 ~09:30 | L3 (Claude) | `solar.html`: karta nie chowa się pod otwartym lewym panelem (lewa krawędź karty = prawa krawędź panelu, w ostateczności arkusz na dole); punkty „Why here” zaczynają się wielką literą. `?v=20261115i` | Bez zmian w API |
| nd 15.11 ~09:25 | L3 (Claude) | `solar.html` wg poprawki użytkownika: obszar = strefa lądowania (wypełnienie 25% na terenie LOLA, z bliska bez kropki; najechanie i klik na sam obszar), karta po najechaniu: „Why here” (tylko z `site-info.js`) + „Conditions, next 30 days” na żywo z `/api/track` (Słońce %, Ziemia %, najdłuższa noc, następny wschód/zachód, werdykt Good/Marginal/Poor), cache na miejsce; na telefonie karta jako arkusz na dole ekranu. `?v=20261115h` | L5/L6: do nagrania: Fly to site na regionie kandydackim i najechanie na obszar |
| nd 15.11 ~09:20 | L3 (Claude) | Panel „3D Moon” na `index.html` (iframe `solar.html?embed=1`, ładowany leniwie): klik „Analyse this site” w karcie 3D wybiera miejsce w analizie i liczy. Jedna linia `<script>` w `index.html`. `predict.js` dołączony, ale jeszcze nie podpięty (404 w konsoli, dopóki nie ma `/api/moon_predict`) | Merge po PR ui-charts albo o 09:30. Przy łączeniu z ui-charts: zostawić linię `embed3d.js` |
| nd 15.11 ~09:15 | L3 (Claude) | `solar.html` po uwagach L1: karta zamyka się przy „Fly to site” (nie zasłania obszaru), mieści się w oknie (przyciągnięta w poziomie, pod znacznikiem, gdy brak miejsca u góry); jaśniejsza nocna strona Księżyca (podłoga 0,16 zamiast 0,07) dla czytelności przy biegunie. `?v=20261115f` | Do nagrania: obszary przy biegunie są teraz widoczne |
| nd 15.11 ~08:05 | L3 (Claude) | `solar.html`: obszary lądowania zamiast samych punktów: regiony kandydackie Artemis jako kwadraty ~15 × 15 km (rozmiar wg NASA, RESEARCH §9.1) wokół środka proxy, misje planowane jako ilustracyjne koła 5 km; po terenie LOLA, z wypełnieniem; wiersz „Area” w karcie; „Fly to site” leci na ~150 km. `?v=20261115e` (tylko 3D) | Do sprawdzenia wzrokowo (L5): obszary widać po „Fly to site” na regionie kandydackim |
| nd 15.11 ~07:25 | L3 (Claude) | Audyt frontendu na żywo: wszystkie funkcje API dostępne w UI, brak błędów JS, 375 px OK. Dodana ikona `web/favicon.svg` (koniec 404 na `/favicon.ico` w konsoli), `?v=20261115c` | L5/L6: „Best spot within 500 m” dla Malapert Massif: 47,2% → 99,7% Słońca (zależy od okna dat) |
| nd 15.11 ~06:00 | L1 (Claude) | Integracja modelu R1 (NN Księżyca: RK4 + korekta MLP, fine-tune PPO) jako dodatek tylko do odczytu: L2 dostaje `src/ppo.rs`, `data/ppo/**`, `docs/PPO.md`; endpoint `/api/ppo_check` (PPO vs ANISE), `/api/track` bez zmian | R1: wagi w JSON + wektory testowe na gałęzi `feat/ppo-model`. L2: port do Rusta. L3: karta „NN vs JPL” |
| nd 15.11 ~02:45 | L3 (Claude) | Fact-check `web/solar/site-info.js` (zamiast L4): poprawione SLIM (55 m od celu, nie „~100 m”), Apollo 11 (21 h 36 min; usunięta niepotwierdzona masa próbek), Hakuto-R 1/2 (błąd oprogramowania / dalmierz laserowy), Peregrine (data powrotu 18.01.2024), Chang'e 5 (1,73 kg, bazalty ~2 mld lat), Chang'e 7 (2027). Importy modułów 3D z `?v=` | L4: daty lądowań nadal czekają na pole `landing_date` w `sites.json` |
| nd 15.11 ~01:30 | L3 (Claude) | Zrzuty ekranu do README w `web/img/` (`analysis.jpg`: sky plot z terenem LOLA + werdykt + odliczanie; `compare.jpg`: 3 regiony Artemis; `moon3d.jpg`: widok 3D z kartą miejsca). Deep linki do demo wysłane L5 | L1: podlinkuj w README. Zrzuty 800 px (z panelu przeglądarki); headless Brave (snap) nie widzi nazw Tailscale |
| nd 15.11 ~01:00 | L3 (Claude) | Poprawka po PR #30: przy pierwszym renderze płótno sky plotu miało 0 px, `createRadialGradient` rzucał błąd i strona nie pokazywała odliczania ani werdyktu. Teraz pusty kadr jest pomijany i strona rysuje się ponownie po ułożeniu. Krótkie nazwy miejsc w porównaniu. `?v=20261115a` | Bez zmian w API. Test na żywo OK (explore, compare, solar) |
| sob 14.11 ~22:08 | L3 (Antigravity) | Redesign `web/` (styl konsoli telemetrii, typografia monospace `tabular-nums`, wykresy canvas z siatką i gradientem terenu), przycisk „Export CSV ↓” (`&format=csv`), link „Horizon →” w kartach 3D (`solar.html`) | Wszystkie ID DOM i parametry URL (`?site=`, `?view=`, `?focus=`) zachowane dla skryptu nagrywającego (L6) |
| sob 14.11 ~21:15 | L2 (W2) | `/api/track?...&format=csv`: CSV dla planistów misji (t_utc, Słońce/Ziemia az/el, horyzont w ich azymucie, sun_vis, earth_vis, odległości), nagłówek `Content-Disposition` z nazwą `track_<lat>_<lon>_<data>.csv`. Domyślnie JSON bez zmian | **L3:** przycisk „Download CSV” = ten sam URL co `/api/track` + `&format=csv` |
| sob 14.11 ~20:45 | L2 (W1) | Łańcuch DEM sprawdzony testami: promienie za krawędzią 80°S biegną dalej po `ldem_75s_120m` (do 300 km), miejsca 75–80°S dostają `lola:ldem_75s_120m` zamiast sfery (działało już z założenia, teraz pokryte testami). Odysseus bez zmian (40,2% Słońca; horyzont na płn. zmienia się o ≤1,1°, Słońce jest tam wysoko); -77°,0°: 52,0% (sfera) → 30,6% (teren 120 m) | **Każdy serwer:** potrzebny `data/raw/dem/ldem_75s_120m.*` (HANDOFF §2). **L4:** liczby wysłane |
| sob 14.11 ~19:30 | L3 (Claude) | `index.html`: panorama horyzontu 360° pod sky plotem (profil LOLA, ścieżki Słońca i Ziemi w oknie, tarcze w chwili kursora, odczyt azymutu i wysokości horyzontu po najechaniu; pętla libracji Ziemi widoczna). Według RESEARCH §9.3 pierwsza taka wizualizacja dla tych miejsc | Do pitchu (L5/L6): panorama Shackleton, grzbiet ~19° na W |
| sob 14.11 ~19:00 | L3 (Claude) | `index.html` polish: tryb Public/Expert (prostsze etykiety, ukryte współrzędne i żargon), werdykt „Good/Marginal/Poor” z progów L4 (RESEARCH §9.1) + fakty §9.2 w trybie Public, walidacja formularza (limit 20 000 kroków), układ na wąskich ekranach (375 px bez poziomego przewijania), wersjonowanie plików `?v=` przeciw starej pamięci podręcznej | L5: do QA (oba tryby, telefon). Panorama 360° z §9.3 jako następna |
| sob 14.11 ~20:00 | L2 (W2) | Przyspieszenie: efemeryda toru liczona wielowątkowo (`/api/track` rok co 1 h: 0,54 → 0,16 s), `/api/best_nearby` liczy kandydatów równolegle (rok, 317 kandydatów: 14 → 7 s). Wyniki bez zmian (te same liczby) | **L1:** restart serwera po merge. API bez zmian |
| sob 14.11 | L4 (W4) | `VALIDATION.md` §3: wyniki z maską LOLA odtworzone przez L4 (Connecting Ridge ≤ 1 pp vs Gläser; punkty Busseya wrażliwe na współrzędne, najlepsze ≤ 500 m od L2); Haworth jako przykład błędu proxy; zaćmienia pominięte. `sites.json`: Haworth → środek mozaiki LROC (-86.75, -23.67), polskie notatki przetłumaczone na EN. `RESEARCH.md` §9: progi werdyktu, fakty do trybu publicznego, dane do panoramy | **L3:** progi i zdania UI w RESEARCH §9; nowe wyniki dla Haworth. **L5:** tabela pitchu w VALIDATION §6 |
| sob 14.11 ~18:15 | L3 (Claude) | `index.html`: panel „If the landing slips” (`/api/compare` w trybie dat, +0/+1/+7/+30 dni): wiersz na datę, zmiany względem planu, ★ najlepsza data, „View” przenosi cały widok na tę datę. Ładuje się sam po każdym Compute (~0,2 s) | Używa okna z formularza (Days), więc liczby różnią się od przykładu L1 z oknem 14 dni |
| sob 14.11 ~17:45 | L3 (Claude) | `index.html`: odliczanie od kursora osi czasu (Sunset/Sunrise, Earthset/Earthrise; Ziemia = środek nad horyzontem, jak w summary), karty „From start” z nowych pól summary, przycisk „Best spot within 500 m” (`/api/best_nearby`, porównanie miejsce vs najlepszy punkt, „Use this spot”) | Brak zmian w API. `/api/compare` jeszcze nieużyte (porównanie potrzebuje `points` do wykresów) |
| sob 14.11 ~19:15 | L2 (W2) | `/api/compare`: tryb przesunięcia daty (`starts=d1,d2` albo `start=…&offsets_days=0,1,7,30`, jedno miejsce, do 12 dat); każdy wpis ma `start`, odpowiedź ma `mode` ("sites"/"dates"); `start` opcjonalne przy `starts`. Krawędź Shackletona, okno 14 d: start 14.11 → 54,6% Słońca, 21.11 → 93,8% | **L3:** widok „poślizg startu”. **L5:** liczby do skryptu demo. Nic nie znika |
| sob 14.11 ~18:30 | L2 (W2) | `summary`: nowe `next_sunrise`, `next_earthrise`, `hours_to_sunrise`, `hours_to_earthrise` (null, gdy nie zachodzi). Nowy `GET /api/compare?ids=0,5&sites=lat,lon;lat,lon&start&days&step_min`: do 6 miejsc równolegle, `entries[]` + `rank_by_sun`/`rank_by_earth` | **L3:** porównanie może brać jedno zapytanie zamiast N × `/api/track`; czas do wschodu na kartach. **L1:** tekst do HANDOFF §5 w PR. Nic nie znika |
| sob 14.11 ~17:15 | L3 (Claude) | `solar.html` v2: minimalistyczny UI (półprzezroczysty lewy panel, górny pasek ze strzałką i 3 przyciskami czasu, wybór daty po rozwinięciu), karty miejsc nad znacznikiem w kolorze statusu, klik = opis; usunięte: dolny panel, oś czasu, link „Sun & Earth from here”. Daty i opisy: `web/solar/site-info.js` | L4: `coord_note` dla Chang'e 7 w `sites.json` ma polski tekst („niezweryfikowane w zrodle pierwotnym”), a widać go w karcie; proszę po angielsku |
| sob 14.11 ~17:30 | L2 (W1/W2) | Nowy `GET /api/best_nearby?lat&lon&start&days&step_min[&alt_m][&radius_m=500][&grid_m=100]`: najlepiej oświetlony punkt w promieniu (maska terenu dla każdego kandydata, efemeryda raz). Przykład: Malapert M1 13,6% → 61,7% po przesunięciu o 255 m. `dem::xy_to_latlon` tylko w testach | **L1:** można usunąć `allow(dead_code)` przy `mod dem`; tekst do HANDOFF §5 w PR. **L3:** opcjonalnie przycisk „najlepszy punkt w pobliżu”. **L4:** liczby do VALIDATION („małe przesunięcie, duży efekt”) |
| sob 14.11 ~16:30 | L3 (Claude) | Frontend na masce LOLA: sky plot skalowany do Słońca/Ziemi (teren > zakresu wypełnia środek = zasłonięte), stan ładowania (pierwsze zapytanie ~3,5 s). Test na żywo przez Tailscale OK | L4: Haworth (proxy w środku krateru) wychodzi 0% Słońca i 0% Ziemi, pewnie PSR; warto sprawdzić współrzędne |
| sob 14.11 ~16:30 | L2 (W1) | Maska horyzontu z LOLA DEM: `horizon::from_dem` (720 az × 0,5°, ray-march z krzywizną, cache per miejsce), podpięta w `/api/track`. Walidacja: Connecting Ridge (Gläser 2014) 91,1% vs 92% i 95,7% vs 95,6% czasu w świetle | **L1:** merge, usuń `allow(dead_code)` przy `mod dem`, restart serwera. **L3:** `horizon.source` = `lola:ldem_80s_40m`, nowe opcjonalne `horizon.ground_m`. **L4:** wyniki VALIDATION §3 wysłane wiadomością |
| sob 14.11 | L4 (W4) | Nowy `docs/VALIDATION.md`: efemerydy zgodne z Horizons ≤ 0,0001° (6 miejsc), budżet błędu horyzontu DEM 40 m, wartości referencyjne oświetlenia (Bussey 2010, Gläser 2014), błąd proxy Artemis, efekty pomijane, tabela do pitchu (EN) | **L2:** po masce horyzontu uruchom 8 zapytań z §3 (albo L1); sprawdź, czy zaćmienia są modelowane. **L5:** tabela §6 do slajdu Validity |
| sob 14.11 ~14:30 | L3 (Claude) | Widok 3D `web/solar.html` (stretch, osobny PR z `feat/ui-3d`): Księżyc w centrum, tekstury NASA SVS 4720 (LROC + LOLA), Układ Słoneczny w skali, ślady 365 dni, klikalne miejsca lądowania, panel czasu u góry, motyw jasny/ciemny | Nie blokuje PR #1. Daty lądowań tymczasowo w `web/solar/landing-dates.js` (docelowo pole w `sites.json`, L4) |
| sob 14.11 ~13:40 | L3 (Claude, nie Antigravity) | W3 frontend: polarny sky-plot (horyzont, Słońce, Ziemia w skali), oś czasu z odtwarzaniem, porównanie 2–3 miejsc; tryb demo bez serwera (`?demo=1`) | L3 potrzebuje IP L1; adres serwera ustawia się w UI (Server) lub `?api=http://<IP-L1>:3000`. Kontrakt API bez zmian |
| sob 14.11 | L4 (W4) | `sites.json`: rozsunięte pary Mons Mouton / Mons Mouton Plateau i Nobile Rim 1 / 2 (nadal proxy, źródła w `coord_note`); `SUBMISSION.md`: szkic tekstów strony projektu (EN) | L2/L3: inne wyniki dla tych 4 regionów; zespół: uzupełnić `[[...]]` w tekstach |
| sob 14.11 ~13:00 | L1 (koordynator) | Czytnik LOLA DEM gotowy i zweryfikowany (`feat/terrain`: Shackleton = dołek 4 km, Malapert = szczyt 4,9 km). Nowe zasady: L1 tylko koordynuje, W1 przechodzi na L2, boty zgłaszają się do L1, dokumenty aktualne w każdym PR | **L2:** przejmij `feat/terrain`, zrób `horizon::from_dem`. **Wszyscy:** `/sync`, zasady w CLAUDE.md |
| sob 14.11 ~11:45 | Claude (koordynator) | Role per laptop, hooki, skille, plan (ten plik) | Każdy PC: clone + `/setup-laptop` |
| sob 14.11 ~11:20 | Claude (czat 0) | Lista urządzeń + Tailscale | Uzupełnić tabelę urządzeń; jeden laptop = serwer |
| sob 14.11 ~10:30 | Claude (czat 0) | Szkielet + dokumentacja, CI zielone, DEM pobrane | Start: każdy bierze swoją gałąź |
