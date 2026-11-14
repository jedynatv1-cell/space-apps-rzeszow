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
