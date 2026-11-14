// TEMPORARY: landing dates (UTC) and short descriptions for the site cards, keyed by the `mission`
// string in data/sites.json. Dates move to an optional `landing_date` field in sites.json once
// L4 adds it and L2 passes it through /api/sites. Re-check wording and dates before submission.
const ARTEMIS = 'Candidate region for NASA\'s first crewed landing near the south pole, picked for long sunlit periods, direct line of sight to Earth and nearby permanently shadowed craters that may hold water ice. Coordinates here are approximate proxies.';

export const SITE_INFO = {
  'Apollo 11': { date: '1969-07-20', text: 'First crewed landing. Armstrong and Aldrin spent about 21.5 hours on the surface of Mare Tranquillitatis and brought back 21.5 kg of samples.' },
  'Apollo 12': { date: '1969-11-19', text: 'Precision landing about 180 m from the Surveyor 3 probe in Oceanus Procellarum; the crew brought parts of Surveyor back to Earth.' },
  'Apollo 14': { date: '1971-02-05', text: 'Landed in the Fra Mauro highlands, the original target of Apollo 13, to sample ejecta from the Imbrium basin.' },
  'Apollo 15': { date: '1971-07-30', text: 'First mission with the Lunar Roving Vehicle; explored Hadley Rille at the foot of the Apennine Mountains.' },
  'Apollo 16': { date: '1972-04-21', text: 'The only Apollo landing in the central highlands. Samples showed the Descartes highlands are mostly impact breccias, not volcanic rock.' },
  'Apollo 17': { date: '1972-12-11', text: 'Last crewed landing, in the Taurus-Littrow valley, with geologist Harrison Schmitt; the longest stay of the Apollo programme.' },
  'Chang\'e 3': { date: '2013-12-14', text: 'China\'s first soft landing, in northern Mare Imbrium, carrying the Yutu rover.' },
  'Chang\'e 4': { date: '2019-01-03', text: 'First soft landing on the far side, in Von Kármán crater inside the South Pole–Aitken basin, with the Yutu-2 rover and the Queqiao relay satellite.' },
  'Chang\'e 5': { date: '2020-12-01', text: 'Sample return from the Mons Rümker region: about 1.7 kg of young basalts.' },
  'Chang\'e 6': { date: '2024-06-01', text: 'First sample return from the far side, from the Apollo basin inside South Pole–Aitken.' },
  'Chang\'e 7': { date: 'planned', text: 'Planned Chinese mission to the south polar region near Shackleton crater to look for water ice.' },
  'Hakuto-R Mission 1': { date: '2023-04-25', text: 'ispace lander lost in the final descent after its altitude estimate went wrong over a crater rim.' },
  'Hakuto-R Mission 2 (Resilience)': { date: '2025-06-05', text: 'ispace\'s second lander, lost during the descent to Mare Frigoris.' },
  'Luna 25': { date: '2023-08-19', text: 'Russia\'s first lunar lander since 1976; it crashed after an engine burn went wrong in lunar orbit.' },
  'Chandrayaan-3 (Vikram)': { date: '2023-08-23', text: 'India\'s first soft landing and the southernmost landing at the time; the Pragyan rover explored the site, named Statio Shiv Shakti.' },
  'SLIM': { date: '2024-01-19', text: 'JAXA precision-landing demonstrator; it touched down within about 100 m of its target but came to rest upside down and still operated.' },
  'IM-1 (Intuitive Machines, CLPS)': { date: '2024-02-22', text: 'Odysseus, the first commercial landing and the first US landing since 1972; it tipped onto its side near Malapert A.' },
  'Blue Ghost Mission 1 (Firefly, CLPS)': { date: '2025-03-02', text: 'Firefly\'s lander, the first fully successful commercial landing; it worked through a full lunar day in Mare Crisium.' },
  'IM-2 (Intuitive Machines, CLPS)': { date: '2025-03-06', text: 'Athena landed on Mons Mouton near the south pole but tipped over, ending the mission early.' },
  'Peregrine Mission One (Astrobotic, CLPS)': { date: 'did not land', text: 'A propellant leak shortly after launch meant the lander never attempted a landing; it re-entered Earth\'s atmosphere.' },
  'Artemis crewed landing (regions announced for Artemis III; first landing now Artemis IV, 2028)': { date: 'candidate', text: ARTEMIS },
};
