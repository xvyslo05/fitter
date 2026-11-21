# Plán: poznatky z přednášky TUL o polohování a co z nich plyne pro fitter

Stav k 2026-11-21, repozitář na `1057506`. Výchozí stav ověřen: `npm run typecheck` a `npm run lint` jsou zelené, `npm test` hlásí 30 souborů a 424 testů prošlo, 1 soubor a 1 test přeskočeny.

**Zdroj.** Ing. Katarína Zelová, Ph.D., FT TUL, Katedra oděvnictví, předmět Výroba oděvů (ODE): 4. přednáška „Polohování oděvních součástí“ a navazující přednáška „CAD systémy“. Jde o tištěné slidy, které dodal vlastník jako šest fotografií. V dokumentu je zkratka **TUL-ZEL/n**, kde n je číslo slidu podle patičky. Materiál bereme jako odborně správný.

**Upozornění k šíření.** Slidy nesou poznámku, že jsou majetkem katedry a bez souhlasu autorky se nesmějí šířit. Repozitář se publikuje přes GitHub Pages. Proto tento dokument i `docs/glossary.md` obsahují jen fakta, čísla a vzorce vlastními slovy s odkazem na číslo slidu, žádné přepisy celých slidů ani obrázky. Před commitem to má potvrdit vlastník (rozhodnutí R0).

**Co bylo nečitelné nebo nevysvětlené.** Slide 5 má obrázek polohy se značkami A_r, V_a, L_a, L_s, L_v a B_n. Slide jejich význam neuvádí, proto je nevykládám. Malé náhledy poloh na slidu 18 nejsou čitelné. Vše ostatní bylo čitelné.

---

## 1. Shrnutí poznatků z přednášky (parafráze)

1. **Pojmy (TUL-ZEL/2, /3).** Polohování je pokládání střihových šablon na materiál dané šíře podle zásad polohování, s ohledem na technologii a s cílem co nejlépe využít plochu. Správná poloha šablon zajistí kvalitu výrobku i minimální spotřebu materiálu, tedy délku polohy. Střihová šablona je díl s přídavky na švy a koncovými záložkami, se směrem položení (referenční linií), pozičními značkami a označením vzoru a velikosti. Polohový plán je nakreslená střihová poloha. Poloha se dělá zvlášť pro každý materiál: vrchová, podšívková, vložková a kapsová. Vícepoloha obsahuje kompletní sady dílů pro více výrobků.
2. **Sedm zásad (TUL-ZEL/4):** (1) uložení dílů podle referenční linie, (2) respektování použitého materiálu, (3) minimalizace technologického odpadu, (4) dodržení bezpečnostní vzdálenosti, (5) využití šířky materiálu, (6) nejprve velké díly, malé se doplňují do mezer, (7) poloha má na obou koncích rovné zakončení, protože délka polohy určuje spotřebu.
3. **Na čem uspořádání závisí (TUL-ZEL/5):** na fazóně, na materiálu (druh, šíře, vlas, vzor, kvalita) a na technologii nakládání, oddělování a spojování.
4. **Referenční linie (TUL-ZEL/6):** všechny díly leží referenční linií rovnoběžně se směrem osnovních přízí u tkaniny, nebo se sloupkem u pleteniny. Na obrázku vedou šipky dílů podél délky polohy L_p; šířka polohy je B_p.
5. **Materiál (TUL-ZEL/7, /8, /9):** u materiálu bez vzoru (UNI) lze díly položit i otočené o 180°, což šetří materiál. U materiálu se vzorem (káro, proužek) je nutné dodržet návaznost vzoru ve stanovených spojovacích švech (pravý a levý díl, přední a zadní díl, kapsy, límce). U materiálu s vlasem se všechny díly kladou jedním směrem; totéž platí pro materiály s výraznou strukturou povrchu, například lesklé. Na příkladu netkané textilie leží díly v různých směrech bez šipek.
6. **Vzorce (TUL-ZEL/10):** plocha polohy S_p = B_p · L_p [m²]. Výtěžnost (efektivita využití plochy polohy) e = ΣS_i / S_p · 100 [%], kde S_i jsou plochy všech šablon. Technologický odpad O_t = S_p − ΣS_i [m²]. Platí e + O_t% = 100 %, kde O_t% = O_t / S_p · 100.
7. **Racionální využití polohy (TUL-ZEL/11):** vícepolohy (čím víc velikostí a druhů, tím výhodněji lze šablony rozložit), dělení součástí tam, kde je to možné (spodní límec, podsádka), odklon součástí od referenční linie o ±3° a otočení součástí, pokud to materiál dovoluje. Výslovně: tím se nikdy nesmí snížit kvalita výrobku.
8. **Bezpečnostní vzdálenost mezi díly (TUL-ZEL/12):** závisí na vlastnostech materiálu (stáčení krajů, třepivost, sklon k tavení, tloušťka, tvarová stálost) a na technologii oddělování: cutter 0–1 mm, ruční výřez 5 mm, technická konfekce 15 mm.
9. **Šířka materiálu (TUL-ZEL/13, /14):** poloha nesmí obsahovat pevný kraj materiálu. V průmyslu se nejčastěji polohuje v plné šíři. Poloviční šíře znamená v přehybu, nebo v hadici (pleteniny). U pletenin se počítá se stáčením krajů.
10. **Způsoby tvorby polohy (TUL-ZEL/15, /16):** ve skutečné velikosti, se zmenšenými šablonami, nebo počítačem (interaktivně, automaticky, poloautomaticky podle referenční polohy). Výhody počítače jsou rychlost, přesnost, přehlednost a ukládání poloh v databázi.
11. **Jednopoloha a vícepoloha (TUL-ZEL/18, /19, /20):** jednopoloha (sada pro jeden výrobek) je z hlediska výtěžnosti většinou nevýhodná. Vícepoloha je jeden druh vícekrát, jeden druh ve více velikostech, více druhů v jedné velikosti, nebo více druhů v různých velikostech. Slide 19 ukazuje velikosti 36, 38 a 40 promíchané v jedné poloze. Snímek CAD na slidu 20 ukazuje vícevelikostní polohy (M, XL, 2XL) o šířce asi 186–188 cm (číslice na fotografii nejsou jisté) a délce asi 655 cm s výtěžností **85,27 %** a **85,68 %**.
12. **Zrcadlově a jednostranně uspořádaná poloha (TUL-ZEL/21):** zrcadlová obsahuje kompletní sadu, pravé i levé díly jsou zrcadlově a mohou se posouvat ve směru os x a y, nakládá se v plné šíři. Jednostranná používá jen polovinu šablon a slouží pro nakládání líc-líc (L-L), tedy pro materiály se vzorem a vlasem, a pro nakládání v přehybu nebo v hadici.
13. **CAD/CAM/CIM (TUL-ZEL/22–24):** jen pozadí (definice pojmů a trendy), pro fitter bez přímého dopadu.

---

## 2. Porovnání s aplikací

Legenda: **(a)** máme a je správně, **(b)** máme, ale chybně nebo jinak, navrhuji opravu, **(c)** chybí, návrh nebo vědomé odložení.

| # | Poznatek (zdroj) | Fitter dnes (soubor:řádek) | Stav | Co s tím |
|---|---|---|---|---|
| 1 | Referenční linie rovnoběžně s osnovou, díly podél délky polohy (TUL-ZEL/6) | Import otáčí díl tak, aby vlákno vedlo podél délky látky (`src/i18n/cs.ts:416`); nester pracuje s osou y jako délkou; šipka „Směr vlákna“ v nákresu | (a) | nic |
| 2 | Otočení o 180° jen u materiálu bez vzoru, UNI (TUL-ZEL/7, /11) | Výchozí `rotation: '180'` (`src/model/prepare.ts:31`); u látky s vlasem nebo směrem vzoru se vynutí `'none'` (`prepare.ts:188`) | (a) | Jen doplnit text o lesklých materiálech (TUL-4) |
| 3 | Vlas a výrazná struktura povrchu: všechny díly jedním směrem (TUL-ZEL/7) | Zaškrtávátko „Látka má vlas nebo směr vzoru“ (`cs.ts:70-71`) zakáže otáčení i natočení (`prepare.ts:188-190`); zrcadlení kolem svislé osy směr zachová | (a), text neúplný | TUL-4: doplnit „lesklé materiály, výrazná struktura povrchu“ |
| 4 | Návaznost vzoru u proužku a kára (TUL-ZEL/7, /9) | Nepodporováno; jen obecná poznámka v `results.footnote` (`cs.ts:186`) | (c) | Výslovné varování (TUL-4); samotná návaznost je mimo rozsah (R6) |
| 5 | Otočení o 90° (napříč) | Volba „I napříč (po 90°)“ globálně i po dílech (`src/ui/fields.tsx:49`, `cs.ts:29`) s upozorněním, že mění směr vlákna | (a) jako volba uživatelky | TUL-4: doplnit do `order.rotationNote` (`cs.ts:119`), že napříč lze klást hlavně netkané textilie (výklad obrázku TUL-ZEL/8, ne výslovná věta) |
| 6 | Odklon ±3° od referenční linie, kvalita se nesmí snížit (TUL-ZEL/11) | Ticket 21 hotový: konstanta `DEFAULT_GRAIN_TOLERANCE_DEG = 3` (`prepare.ts:28`), výchozí vypnuto (`prepare.ts:31`), u látky se směrem a u dílu na přehybu vždy 0 (`prepare.ts:190`); nester zkouší jen −3, 0, +3 (`src/nest/raster.ts:63-65`) | (a) | Hodnota je nyní podložená (D11 potvrzeno). Diskrétní ±3° je platná podmnožina pravidla. Zákaz u látky se směrem je vlastní konzervativní volba aplikace, slide ho neuvádí. Zda zapnout ve výchozím stavu: R1, TUL-7 |
| 7 | Vzorce: plocha polohy, výtěžnost, odpad (TUL-ZEL/10) | `utilization = placedArea / (width × (fabric.length ?? usedLength))` (`src/nest/nest.ts:91`, `src/nest/adjust.ts:25`); plocha dílů je řezný obrys včetně přídavku, šířka je využitelná šířka (polovina u přehybu) | (a) pro roli, **(b)** pro „Už mám kus“ | U pevného kusu se dělí délkou kusu, ne délkou polohy L_p. Je to vědomé rozhodnutí, test ho drží (`tests/adjust.test.ts:70`), ale neodpovídá definici výtěžnosti. Rozhodnutí R3, TUL-5. Procento odpadu (100 − e) se nikde neukazuje (c), R4 |
| 8 | Bezpečnostní vzdálenost: cutter 0–1 mm, ruční výřez 5 mm, technická konfekce 15 mm; závisí i na materiálu (TUL-ZEL/12) | `DEFAULT_GAP_CM = 0.5` (`prepare.ts:26`); díly se nafouknou o gap/2, takže skutečná vzdálenost je aspoň gap (`raster.ts:30`); nápověda „Pro stříhání nůžkami nechte 0,5 cm“ (`cs.ts:80`) | (a) hodnota, text neúplný | D12 je podložené: 5 mm odpovídá ručnímu výřezu. Pozor: přirovnání „ruční výřez = nůžky“ je náš výklad, slide ho neříká. TUL-3 doplní hodnoty podle technologie a vliv materiálu do nápovědy. Předvolby: R5 |
| 9 | Poloha nesmí obsahovat pevný kraj materiálu (TUL-ZEL/13) | README výslovně: „Hrany látky nemají povinný odstup“ (`README.md:59`); nester i ruční posun pouštějí díl až k x = 0 a x = šířka (`nest.ts:62-63`, `adjust.ts:39-41`); pole „Šíře látky“ bez vysvětlení (`src/ui/FabricEditor.tsx:15`) | **(b)** | Dřívější předpoklad byl chybný. Minimální oprava bez geometrie: zadávat šíři bez pevných okrajů a říct to v UI a README (TUL-2). Skutečný okraj v nesteru jen po rozhodnutí R2 (TUL-6) |
| 10 | Pleteniny: stáčení krajů (TUL-ZEL/12, /13) | Nic | (c) | Pokrývá stejný mechanismus jako bod 9 (TUL-2 text, TUL-6 volitelně) |
| 11 | Plná šíře, přehyb (TUL-ZEL/13, /14) | Nesložená látka a „Složená napůl, lícem dovnitř“ s přehybem vlevo (`cs.ts:68-69`) | (a) | nic |
| 12 | Hadice (pletenina, oba kraje jsou přehyby) (TUL-ZEL/13) | Nepodporováno | (c) | Odložit (R7); domácí šička hadicovou pleteninu stříhá zřídka |
| 13 | Nejprve velké díly, malé do mezer (TUL-ZEL/4, zásada 6) | Výchozí pořadí podle plochy sestupně (`nest.ts:93`), další průchody pořadí mění | (a) | nic |
| 14 | Rovné zakončení na obou koncích, délka polohy = spotřeba (TUL-ZEL/4, zásada 7) | Délka se měří od y = 0 po nejnižší bod (`nest.ts:87`); ke koupi se zaokrouhluje na 5 cm (`src/model/summary.ts:6-7`) | (a) | nic |
| 15 | Zrcadlově uspořádaná poloha v plné šíři; jednostranná pro přehyb a L-L (TUL-ZEL/21) | Nesložená látka: každý druhý kus zrcadlově (`prepare.ts:183`); přehyb: spodní vrstva dává zrcadlový díl (`cs.ts:192`) | (a) | nic; pojmy doplněny v glosáři |
| 16 | Poloha zvlášť pro každý materiál (vrchová, podšívková, vložková, kapsová) (TUL-ZEL/3) | Jeden polohový plán na materiál (`prepare.ts:155-178`) | (a) | nic |
| 17 | Vícepoloha (více výrobků a velikostí v jedné poloze) (TUL-ZEL/3, /11, /18) | Více řádků „Co šiju“ s různými střihy, velikostmi a počty jde do jedné polohy na materiál | (a) | nic |
| 18 | Jednopoloha má horší výtěžnost; průmyslové vícepolohy asi 85 % (TUL-ZEL/18, /20) | Předpoklad z analýzy: průmysl 82–88 %, fitter 63–74 % na jednom oděvu, „not directly comparable“ (`docs/tickets/24-nesting-benchmark.md:260`) | (a) | Předpoklad potvrzen slidy (85,27 % a 85,68 % u vícevelikostní polohy, jednopoloha výslovně nevýhodná). Cíl ticketu 25 (+3 p. b.) zůstává rozumný; 85 % u jednoho oděvu nehonit. TUL-8 doplní referenci do benchmarku |
| 19 | Dělení součástí (spodní límec, podsádka) (TUL-ZEL/11) | Nepodporováno; je to věc konstrukce střihu | (c) | Mimo rozsah (R8) |
| 20 | Šablona obsahuje přídavky na švy a koncové záložky (TUL-ZEL/2) | Jednotný přídavek na švy kolem celého dílu, jen u střihů bez přídavků (`prepare.ts:149-167`); záložka na lem zvlášť není | (a) pro fitter jako nástroj na hotové střihy | Mimo rozsah; jen poznámka. Glosář opraven: TUL píše „přídavky na švy“, ne „švové záložky“ |
| 21 | Způsoby: interaktivně, automaticky, poloautomaticky podle uložené polohy (TUL-ZEL/16) | Automatický výpočet a ruční posun (ticket 26); ruční úpravy se neukládají (`README.md:16`) | (a) interaktivní a automatický, (c) ukládání poloh | Ukládání poloh odložit (R9) |
| 22 | Zmenšené šablony vs. skutečná velikost (TUL-ZEL/15) | Tisk jedné stránky se zmenšeným nákresem a kótami (`cs.ts:223`) | (a) | Odpovídá rozhodnutí D4 |
| 23 | Terminologie | `polohový plán`, `přehyb`, `přídavek na švy`, `směr vlákna`, `mezera mezi díly`, `využití` | (a) | Slidy potvrzují „polohový plán“, „přehyb“ a „přídavek na švy“. Glosář doplněn (sekce TUL-ZEL) |

### Hodnocení dřívějších předpokladů a rozhodnutí

- **D11, odklon 3° (ticket 21):** správně. Hodnota je nyní v univerzitním materiálu. Volba „vypnuto, zapnout zaškrtnutím“ je v souladu s větou, že se nesmí snížit kvalita výrobku. Vypnutí u látky se směrem je naše opatrnost, ne pravidlo ze slidu; je to rozumné, protože u vzoru by odklon narušil návaznost.
- **D12, mezera 0,5 cm (ticket 22):** správně, odpovídá 5 mm pro ruční výřez. Slabé místo je text „pro stříhání nůžkami“: slide mluví o ručním výřezu, ne o nůžkách. Hodnotu to nemění, text to zpřesní (TUL-3).
- **Benchmark 82–88 % a věta „not directly comparable“:** správně. Slidy přímo říkají, že jednopoloha je pro výtěžnost nevýhodná, a ukazují asi 85 % jen u vícevelikostní polohy.
- **„Hrany látky nemají povinný odstup“ (README):** chybně. Poloha nesmí obsahovat pevný kraj. Aplikace to dosud nijak neříká a nákres dovolí díl až k okraji. Oprava TUL-2, případně TUL-6.
- **Výtěžnost u pevného kusu:** jiná definice, než učí TUL. U pevného kusu fitter ukazuje „kolik procent kusu se využilo“, ne výtěžnost polohy. Obojí má smysl, ale pod jedním názvem „Využití“ je to matoucí. Rozhodnutí R3.
- **Glosář „TUL naopak píše švové záložky“:** zavádějící. Přednáška rozlišuje přídavky na švy a koncové záložky stejně jako Burda. Opraveno v glosáři.
- **Výchozí otáčení 0° a 180°:** správně pro UNI materiál a je to nejčastější případ. Látky se vzorem pokrývá zaškrtávátko směru.
- **Ticket 28 (otázky pro studentku):** většina otázek je nyní zodpovězená z přednášky; viz tabulka v oddílu 3.

---

## 3. Ticket 28: které otázky slidy zodpověděly

| Otázka z `docs/tickets/28-marker-rules-spec.md` | Odpověď z přednášky | Zdroj |
|---|---|---|
| 1. Předepsaná mezera, liší se podle technologie? | Ano: cutter 0–1 mm, ruční výřez 5 mm, technická konfekce 15 mm; navíc podle vlastností materiálu | TUL-ZEL/12 |
| 2. Měří se mezera mezi řeznými čarami? | Neřečeno výslovně; šablony už obsahují přídavky na švy (TUL-ZEL/2), takže vzdálenost je mezi šablonami, tj. řeznými obrysy. Fitter to tak dělá | TUL-ZEL/2, /12 (odvozeno) |
| 3. Smí díly sdílet řeznou čáru (mezera 0)? | Neodpovězeno; cutter 0 mm to připouští | TUL-ZEL/12 |
| 4. Povolený odklon od osnovy? | ±3° od referenční linie | TUL-ZEL/11 |
| 5. Odklon po dílech, nebo stejně pro celý oděv? | Neodpovězeno | – |
| 6. Díly bez odklonu nebo naopak volně? | Neodpovězeno; jen příklad netkané textilie bez vazby na směr | TUL-ZEL/8 |
| 7. Kdy otočit o 180°, kdy o 90°? | 180° u materiálu bez vzoru (UNI); o 90° nic výslovně | TUL-ZEL/7, /11 |
| 8. Které látky jsou směrové? | Vlas, výrazná struktura povrchu (např. lesklé); vzor káro a proužek vyžaduje návaznost | TUL-ZEL/7 |
| 9. Jeden směr pro každý oděv zvlášť? | Neodpovězeno | – |
| 10. Přehyb a vlas, zvláštní omezení? | Jednostranná poloha je určená pro nakládání líc-líc, přehyb a hadici, tedy pro vzor a vlas | TUL-ZEL/21 |
| 11. Odstup od pevného kraje? | Poloha nesmí obsahovat pevný kraj; hodnota neuvedena | TUL-ZEL/13 |
| 12. Přídavek na začátku a konci délky? | Neuvedeno; jen „rovné zakončení na obou koncích“. Značky L_a na slidu 5 mohou souviset, ale nejsou vysvětlené, nevykládám | TUL-ZEL/4, /5 |
| 13. Kdy nesložená, přehyb, hadice? | Průmysl nejčastěji plná šíře; poloviční šíře v přehybu nebo v hadici (pleteniny) | TUL-ZEL/13 |
| 14. Pravý a levý díl na jedné vrstvě vždy zrcadlově? | Ano, zrcadlově uspořádaná poloha obsahuje pravé i levé díly zrcadlově | TUL-ZEL/21 |
| 15. Které švy navazovat, kolik materiálu navíc? | Spojovací švy: pravý a levý díl, přední a zadní díl, kapsy, límce; spotřeba navíc neuvedena | TUL-ZEL/7 |
| 16. Velké motivy? | Neodpovězeno | – |
| 17. Dobrá výtěžnost doma vs. průmysl? | Průmyslová vícepoloha asi 85 %; jednopoloha výslovně horší, bez čísla | TUL-ZEL/18, /20 |
| 18. Přídavek na srážení a chyby? | Neodpovězeno (fitter už upozorňuje na srážení, `summary.ts:31`) | – |
| 19. Pořadí kladení? | Velké díly první, malé do mezer | TUL-ZEL/4 |

---

## 4. Rozhodnutí k potvrzení vlastníkem

| Id | Otázka | Doporučení | Dopad |
|---|---|---|---|
| R0 | Smí do veřejného repozitáře jít parafráze slidů s odkazem (tento soubor a doplněný glosář)? | Ano, jen parafráze a čísla, bez fotografií a přepisů; jinak soubor necommitovat | Všechny tikety |
| R1 | Zapnout odklon ±3° ve výchozím stavu? | **Ne**, nechat volbu. Nejdřív změřit přínos benchmarkem (0 vs. 3 při 5 s) a rozhodnout podle čísel | TUL-7 |
| R2 | Přidat do nesteru skutečný odstup od pevného kraje (nastavení u látky)? | Zatím **ne**; stačí TUL-2 (zadávat šíři bez krajů). Odstup přidat, až se objeví potřeba u pletenin | TUL-6 |
| R3 | Výtěžnost u pevného kusu počítat podle TUL (délkou polohy), nebo nechat „využití kusu“? | **Podle TUL**, tedy vždy délkou polohy; zbytek kusu už ukazuje souhrn („zbyde N cm“) | TUL-5 |
| R4 | Ukazovat i procento odpadu (100 − výtěžnost)? | **Ne**; je to jen doplněk do 100 %, nic nového neřekne | TUL-5 krok 5 se nedělá |
| R5 | Předvolby mezery podle technologie (0,1 / 0,5 / 1,5 cm)? | **Ne**; stačí hodnoty v nápovědě. Technická konfekce se domácí šičky netýká | TUL-3 |
| R6 | Návaznost vzoru (proužek, káro)? | Mimo rozsah; jen varování (TUL-4) | – |
| R7 | Hadicová pletenina (přehyb na obou krajích)? | Odložit | – |
| R8 | Dělení součástí (spodní límec, podsádka)? | Mimo rozsah (konstrukce střihu) | – |
| R9 | Ukládání hotových poloh a poloautomatické polohování podle uložené polohy? | Odložit | – |

---

## 5. Tikety

Pořadí podle priority a závislostí: **TUL-1, TUL-2, TUL-3, TUL-4, TUL-8**, potom podle rozhodnutí **TUL-5**, **TUL-7**, **TUL-6**.

Společná pravidla pro všechny tikety:

- Definition of done podle `docs/tickets/README.md`: `npm run typecheck`, `npm run lint` a `npm test` jsou zelené. Výchozí stav: 30 souborů, 424 testů prošlo, 1 přeskočen. Počet prošlých testů nesmí klesnout.
- Každý nový nebo změněný text má klíč v `src/i18n/cs.ts` **i** v `src/i18n/en.ts` se stejnými `{parametry}`. `tests/i18n.test.ts` kontroluje prázdné hodnoty a parametry a hledá česká písmena mimo slovník.
- Nic nemazat. Nepoužívaný kód jen vyjmenovat v popisu změny.
- Žádné úpravy mimo vyjmenované soubory. Necommitovat bez souhlasu vlastníka.
- Texty z přednášky jen parafrázovat; do kódu a README necitovat celé věty ze slidů.

### TUL-1 · Uzavřít ticket 28 a označit D11, D12 jako potvrzené (bez kódu)

**Cíl.** Pravidla polohování z přednášky jsou zapsaná jako testovatelný seznam a rozhodnutí D11 (3°) a D12 (0,5 cm) jsou v ticketech vedená jako potvrzená zdrojem.

**Soubory.** Nový `docs/marker-rules.md`; `docs/tickets/README.md`; `docs/tickets/21-grain-tolerance.md`; `docs/tickets/22-gap-default.md`; `docs/tickets/28-marker-rules-spec.md`; komentáře v `src/model/prepare.ts:25` a `:27`.

**Kroky.**
1. Vytvořit `docs/marker-rules.md`: tabulka se sloupci *id pravidla, pravidlo jednou větou, hodnota a jednotka, kdy platí, zdroj (TUL-ZEL/n), jistota, fitter dnes, navrhované chování, testovatelné tvrzení*. Řádky vzít z oddílu 2 tohoto plánu, body 1–3, 5, 6, 8, 9, 13–15 a 18. Zdroj uvádět jako „Zelová, Výroba oděvů, 4. přednáška, slide n“. Pod tabulku zkopírovat tabulku z oddílu 3 tohoto plánu.
2. Testovatelná tvrzení psát ve tvaru, jaký používá `tests/nest.test.ts`. Příklady: „pro každou dvojici umístění platí `polygonDistance ≥ gap`“; „u látky s `directional: true` má každý `NestPiece` `rotation === 'none'` a `tilt === 0`“; „`|placement.tilt| ≤ 3`“.
3. V `docs/tickets/README.md` v tabulce „Assumed product decisions“ změnit stav D11 na `CONFIRMED (TUL-ZEL/11)` a D12 na `CONFIRMED (TUL-ZEL/12)`. V indexu u řádků 21, 22 a 28 změnit „D11 to confirm“ a „D12 to confirm“ na „D11 confirmed“ a „D12 confirmed“. Do indexu přidat odkaz na `docs/marker-rules.md` a na tento plán.
4. V ticketech 21, 22 a 28 do oddílu „Decisions assumed“ přidat jeden řádek: „Potvrzeno 2026-11-21 přednáškou TUL (Zelová, 4. přednáška, slide 11 resp. 12), viz docs/marker-rules.md.“
5. V `src/model/prepare.ts` změnit jen komentáře: řádek 25 na `// Default gap between pieces in cm; 5 mm = hand cutting in the TUL lecture (docs/marker-rules.md).` a řádek 27 na `// Tilt the checkbox "Povolit mírné natočení dílů" switches on; ±3° per the TUL lecture (docs/marker-rules.md). Off by default.`

**Hotovo, když.**
- `test -f docs/marker-rules.md` uspěje.
- `grep -c "TUL-ZEL\|slide" docs/marker-rules.md` vrátí aspoň 10.
- `grep -n "CONFIRMED" docs/tickets/README.md` najde D11 i D12.
- `git diff --stat` ukazuje jen `docs/` a `src/model/prepare.ts`. `git diff src/model/prepare.ts` mění jen dva řádky komentářů.
- `npm run typecheck && npm run lint && npm test` jsou zelené.

**Nedělat.** Neměnit hodnoty konstant ani výchozí nastavení. Nepsat do dokumentu přepisy slidů. Nezakládat nové tikety jako soubory.

### TUL-2 · Šíře látky bez pevných okrajů (text, bez změny geometrie)

**Cíl.** Uživatelka ví, že má zadat šíři bez pevných okrajů, protože poloha je nesmí obsahovat. README přestane tvrdit opak.

**Soubory.** `src/i18n/cs.ts`, `src/i18n/en.ts`, `src/ui/FabricEditor.tsx`, `README.md`.

**Kroky.**
1. Do `cs.ts` za klíč `'fabric.width'` (řádek 64) přidat nový klíč: `'fabric.widthNote': 'Zadejte šíři bez pevných okrajů, ty se do střihu nepočítají. U pleteniny, která se na krajích stáčí, odečtěte i stočený okraj.'`
2. Do `en.ts` za `'fabric.width'` (řádek 64) přidat: `'fabric.widthNote': 'Enter the width without the selvages; they are not used for cutting. For a knit that curls at the edges, leave out the curled edge too.'`
3. V `src/ui/FabricEditor.tsx` vložit za uzavírací `</div>` řádku 16 (konec `field-row`) nový řádek `<p class="small muted">{t('fabric.widthNote')}</p>`.
4. V `README.md:59` nahradit větu „Hrany látky nemají povinný odstup.“ větou „Šíři látky zadávejte bez pevných okrajů: polohový plán je podle zásad polohování nesmí obsahovat. Aplikace sama žádný odstup od okraje nepřidává.“
5. Najít v `README.md` popis pole šíře v sekci „Použití“ (hledat „Šíře“) a doplnit stejnou větu, pokud tam pole popsané je; jinak nic.

**Hotovo, když.**
- `grep -n "fabric.widthNote" src/i18n/cs.ts src/i18n/en.ts src/ui/FabricEditor.tsx` najde tři řádky.
- `grep -c "nemají povinný odstup" README.md` vrátí 0.
- `npm run typecheck && npm run lint && npm test` jsou zelené.
- Ručně (`npm run dev`): pod polem „Šíře látky“ je nová věta, v angličtině anglická.

**Nedělat.** Neměnit `nest.ts`, `adjust.ts`, typ `Fabric`, předvolby šíře (`FABRIC_WIDTH_PRESETS_CM`) ani výpočet. Neuvádět konkrétní šířku okraje v cm (slide žádnou nedává).

### TUL-3 · Nápověda k mezeře podle technologie a materiálu

**Cíl.** Nápověda k „Mezera mezi díly“ říká hodnoty z praxe podle způsobu stříhání a že náročné materiály potřebují víc.

**Soubory.** `src/i18n/cs.ts`, `src/i18n/en.ts`.

**Kroky.**
1. V `cs.ts:80` nahradit hodnotu `'refine.gapNote'` textem: `'Mezera mezi díly: místo na stříhání mezi sousedními díly. V oděvní výrobě se nechává 0–1 mm při stříhání automatem, 5 mm při ručním výřezu a 15 mm v technické konfekci. Pro stříhání nůžkami nechte {gapAdvice:l1}; u látek, které se třepí, stáčejí na krajích nebo jsou silné, raději víc. Při 0 se díly mohou dotýkat. Přídavek na švy je už započítaný zvlášť.'`
2. V `en.ts:80` nahradit hodnotu `'refine.gapNote'`: `'Gap between pieces: room for cutting between neighboring pieces. Garment factories leave 0–1 mm for automatic cutters, 5 mm for hand cutting (ruční výřez) and 15 mm for technical textiles. For cutting with scissors leave {gapAdvice:l1}; leave more for fabrics that fray, curl at the edges or are thick. At 0 the pieces may touch. The seam allowance is already counted separately.'`
3. Parametr `{gapAdvice:l1}` zůstává; hodnota `gapAdvice: 0.5` v `src/i18n/index.ts:63` se nemění.

**Hotovo, když.**
- `grep -n "15 mm" src/i18n/cs.ts src/i18n/en.ts` najde po jednom řádku.
- `npm run typecheck && npm run lint && npm test` jsou zelené. (`tests/i18n.test.ts` ověří parametry.)

**Nedělat.** Neměnit `DEFAULT_GAP_CM`, rozsah 0–10 cm ani nepřidávat tlačítka předvoleb (rozhodnutí R5). Milimetry v textu nepřevádět jednotkovým formátem; jsou to pevné hodnoty z praxe, i v anglickém textu zůstávají v mm.

### TUL-4 · Texty ke směru materiálu, otočení napříč a proužkům

**Cíl.** Texty u směrové látky, u otáčení o 90° a v poznámce pod výsledky odpovídají pravidlům respektování materiálu.

**Soubory.** `src/i18n/cs.ts`, `src/i18n/en.ts`.

**Kroky.**
1. `cs.ts:71` `'fabric.directionalNote'`: `'Například samet, manšestr, lesklé látky s výraznou strukturou nebo potisk, který má nahoře a dole. Všechny díly budou položené stejným směrem.'`
2. `en.ts:71` `'fabric.directionalNote'`: `'For example velvet, corduroy, shiny fabrics with a strong surface texture, or a print with a top and a bottom. All pieces will be placed facing the same way.'`
3. `cs.ts:119` `'order.rotationNote'`: `'Otáčení o 90° mění směr vlákna; hodí se hlavně pro netkané textilie. Na přehybu se díl pouze obrací podél přehybu.'` Popisek volby `'field.rotation.90'` v `<select>` (`fields.tsx:49`) **neměnit**, dlouhý text by se na telefonu ořízl.
4. `en.ts:119` `'order.rotationNote'`: `'Rotating by 90° changes the grain direction; mainly for nonwovens. A piece on the fold is only flipped along the fold.'`
5. `cs.ts:186` `'results.footnote'`: `'Obrys představuje výslednou řeznou linii. Před stříháním zkontrolujte směr vzoru, vlas látky a údaje ke střihu. Proužky a kostky aplikace nenavazuje; u nich počítejte s více látkou a díly rozložte ručně.'`
6. `en.ts:186` `'results.footnote'`: `'The outline is the final cutting line. Before cutting, check the print direction, the nap of the fabric and the pattern’s instructions. The app does not match stripes or checks; for those, allow extra fabric and lay out the pieces yourself.'`

**Hotovo, když.**
- `grep -n "netkané" src/i18n/cs.ts` a `grep -n "nonwovens" src/i18n/en.ts` najdou po jednom řádku.
- `npm run typecheck && npm run lint && npm test` jsou zelené.
- Pokud některý test porovnává tyto texty doslova (`grep -rn "directionalNote\|rotation.90\|results.footnote" tests`), upravit jen očekávaný text v tom testu.

**Nedělat.** Neměnit chování otáčení ani zaškrtávátka. Nepřidávat podporu návaznosti vzoru (R6). Neměnit `README.md` mimo případnou stejnou větu o proužcích, pokud README tuto poznámku cituje.

### TUL-5 · Výtěžnost podle definice TUL i u pevného kusu (jen pokud R3 = „podle TUL“)

**Cíl.** Číslo „Využití“ je vždy výtěžnost polohy: plocha šablon / (využitelná šířka × délka polohy).

**Soubory.** `src/nest/nest.ts`, `src/nest/adjust.ts`, `tests/adjust.test.ts`, `tests/nest.test.ts` (jen pokud test pevného kusu selže), `README.md`.

**Kroky.**
1. `src/nest/nest.ts:91`: ve výrazu `utilization: placedArea / (width * (fabric.length ?? usedLength) || 1)` nahradit `(fabric.length ?? usedLength)` za `usedLength`.
2. `src/nest/adjust.ts:25`: stejná náhrada.
3. `tests/adjust.test.ts:70`: očekávání `200 / (100 * 50)` nahradit výpočtem s `fixed.result.usedLength` místo 50, stejně jako na řádku 68.
4. Spustit `npm test`. Pokud selže jiný test s pevnou délkou, upravit jeho očekávání stejným způsobem a v popisu změny uvést, který test a proč.
5. `README.md:59`: větu „Využití = plocha umístěných řezných obrysů / (využitelná šířka × délka kusu nebo spotřebovaná délka role).“ nahradit „Využití (výtěžnost polohy) = plocha umístěných řezných obrysů / (využitelná šířka × spotřebovaná délka), i u pevného kusu; kolik z kusu zbyde, říká souhrn.“
6. Krok pro procento odpadu se **nedělá**, pokud R4 = ne.

**Hotovo, když.**
- `grep -n "fabric.length ?? usedLength" src/nest` nic nenajde.
- `npm run typecheck && npm run lint && npm test` jsou zelené.
- Ručně: „Už mám kus“ 300 cm, dva malé díly: využití je vysoké (vztažené k použité délce), souhrn dál říká, kolik zbyde.

**Nedělat.** Neměnit skóre hledání (`nest.ts:123`), souhrn `fabricSummary` ani zaokrouhlení ke koupi.

### TUL-6 · Odstup od pevného kraje v nesteru (jen pokud R2 = ano; potřebuje schválený plán)

**Cíl.** Pro každou látku lze zadat okraj v cm, který poloha nesmí použít.

**Rozsah a schválení.** Mění se 5 a více souborů: `src/nest/types.ts`, `src/nest/nest.ts`, `src/nest/adjust.ts`, `src/storage.ts`, `src/model/prepare.ts` (validace), `src/ui/FabricEditor.tsx`, `src/ui/Layout.tsx`, `src/i18n/cs.ts`, `src/i18n/en.ts`, testy a README. Podle pravidel vlastníka je nutné schválení plánu před kódováním; tento tiket je jen jeho návrh.

**Kroky (návrh k odsouhlasení).**
1. `Fabric` (`types.ts:15`) získá `selvage?: number`, okraj v cm na každé straně, rozsah 0–5, výchozí 0.
2. V `placePass` (`nest.ts:50`) využitelná šířka: nesložená `fabric.width − 2·s`, složená `fabric.width / 2 − s` (oba pevné kraje leží vpravo, přehyb vlevo). Nesložená látka posune umístění o `+s` v ose x, složená ne.
3. Totéž v `tryMove` (`adjust.ts:37-41`): meze `minX = s` u nesložené, `maxX = width − s`.
4. Jmenovatel výtěžnosti je využitelná šířka bez okrajů (šířka polohy B_p).
5. `storage.ts:43`: načíst `selvage`, pokud je číslo 0–5, jinak 0.
6. `FabricEditor`: číselné pole „Pevný okraj (z každé strany)“ pod šíří. `Layout`: okraj vyšrafovat.
7. Testy: v `tests/nest.test.ts` pro `selvage: 2` mají všechna umístění `minX ≥ 2` a `maxX ≤ width − 2` (nesložená) a `maxX ≤ width/2 − 2` (složená); s `selvage` 0 nebo chybějícím je výsledek totožný s dneškem pro stejný seed.

**Hotovo, když.** Testy výše procházejí; `npm run typecheck && npm run lint && npm test` jsou zelené; starý uložený stav bez `selvage` se načte.

**Nedělat.** Neměnit výchozí hodnotu na nenulovou (slide hodnotu nedává). Nepřidávat hadici.

### TUL-7 · Odklon ±3° zapnutý ve výchozím stavu (jen pokud R1 = ano)

**Cíl.** Nové nastavení má odklon zapnutý na 3°.

**Soubory.** `src/model/prepare.ts`, `tests/grain-tolerance.test.ts`, `README.md`.

**Kroky.**
1. Nejdřív změřit, bez úprav kódu: `FITTER_BENCH=1 FITTER_TILT=0 npx vitest run tests/local/nest-benchmark.test.ts` a `FITTER_BENCH=1 FITTER_TILT=3 npx vitest run tests/local/nest-benchmark.test.ts` (benchmark čte `FITTER_TILT`, `tests/local/nest-benchmark.test.ts:15`). Benchmark potřebuje soukromou složku `library/`, takže běží jen na počítači vlastníka; bez ní se přeskočí a tiket čeká na vlastníka. Čísla zapsat do popisu změny. Pokud průměrné zlepšení využití nedosáhne 0,5 p. b., tiket zastavit a vlastníkovi napsat čísla.
2. `prepare.ts:31`: `grainTolerance: 0` změnit na `grainTolerance: DEFAULT_GRAIN_TOLERANCE_DEG`.
3. `tests/grain-tolerance.test.ts:17`: řádek `expect(defaultSettings.grainTolerance).toBe(0)` změnit na očekávání `DEFAULT_GRAIN_TOLERANCE_DEG`. Ostatní testy nechat.
4. README: v popisu volby „Povolit mírné natočení dílů“ změnit „vypnuto“ na „zapnuto“, pokud tam stav je uveden.

**Hotovo, když.** `grep -n "grainTolerance: DEFAULT_GRAIN_TOLERANCE_DEG" src/model/prepare.ts` najde řádek; `npm run typecheck && npm run lint && npm test` jsou zelené.

**Nedělat.** Neměnit hodnotu 3, logiku pro látku se směrem a díly na přehybu (`prepare.ts:190`), ani `storage.ts` (uložená nastavení si ponechají svou hodnotu).

### TUL-8 · Reference v benchmarku doplnit o čísla z přednášky

**Cíl.** Lokální benchmark při výpisu uvádí i referenci z přednášky.

**Soubory.** `tests/local/nest-benchmark.test.ts`.

**Kroky.** Za řádek 60 (konec reference z diplomové práce) přidat do stejného pole řetězců řádek: `'TUL lecture (Zelová, polohování, slide 20): multi-size industrial markers M/XL/2XL at about 187 cm width reach 85.27 % and 85.68 %; single-garment markers are described as mostly unfavourable for yield.'`

**Hotovo, když.** `npm run typecheck && npm run lint && npm test` jsou zelené (benchmark se bez `FITTER_BENCH=1` přeskočí); `grep -n "85.68" tests/local/nest-benchmark.test.ts` najde řádek.

**Nedělat.** Neměnit případy, prahy ani logiku benchmarku.

---

## 6. Vědomě mimo rozsah

Návaznost vzoru (R6), hadice (R7), dělení součástí (R8), ukládání poloh do databáze a poloautomatické polohování (R9), samostatná koncová záložka na lem, výklad značek ze slidu 5. Žádný kód se v tomto plánu nemaže. Nepoužívaný kód nebyl při průzkumu systematicky prohledáván.
