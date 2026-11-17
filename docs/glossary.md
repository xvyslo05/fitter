# Glosář: oděvní a střihová terminologie (CZ/EN) pro fitter

Stav k 2026-11-17. Sestaveno ověřením proti veřejným zdrojům; zdroje parafrázovány, bez dlouhých citací.
Důvěra: **high** = termín jsem přímo viděl v textu zdroje (nebo ve více zdrojích); **medium** = jeden zdroj nebo jen úryvek z vyhledávání; **low** = nepodařilo se ověřit, jde o odhad nebo obecnou znalost.

## Zdroje (zkratky)

| Zkratka | Zdroj | Poznámka |
|---|---|---|
| BURDA | https://www.burdastyle.cz/soubory/dokumenty/informace.pdf (Burda, Informace a tipy k šití, slovníček, 2/2018) a návody https://www.burdastyle.cz/soubory/dokumenty/navod-113-03-2018.pdf, https://www.burdastyle.cz/soubory/dokumenty/navod-101-09-2022.pdf, https://www.burdastyle.cz/soubory/dokumenty/navod-118-12-2022.pdf | Čteno celé (text vytažen z PDF). Dvojjazyčný DE-CZ slovníček. Nejsilnější zdroj pro spotřebitelskou češtinu. |
| SIKULKY | https://www.prosikulky.cz/wp-content/uploads/2020/11/SILUETA-INFO-2021.pdf (průvodce k elektronickému střihu) a https://www.prosikulky.cz/jak-slepit-strih | Čteno celé. Český prodejce PDF střihů; kompletace, polohování, tkaniny/pleteniny. |
| STARFOS | https://starfos.tacr.cz/en/vysledky-vyzkumu/RIV%2F46747885%3A24410%2F07%3A%230000081 | Záznam výzkumu TUL, česky i anglicky: polohování = marker making, výtěžnost = fabric utilisation. |
| TUL-excerpt | výukové materiály katedry oděvnictví TUL na elearning.tul.cz (např. https://elearning.tul.cz/pluginfile.php/894909/mod_resource/content/5/VOD_4_LS_2023_Polohovani.pdf) | **Stránku jsem neotevřel** (vyžaduje přihlášení). Používám jen úryvky zobrazené ve výsledcích vyhledávání. Proto nanejvýš **medium**. |
| OCS | https://onlineclothingstudy.com/?p=10738 | EN: marker, marker making, marker efficiency, fabric utilization. |
| WIKI-SP | https://en.wikipedia.org/wiki/Sewing_pattern | EN: grainline, notches, seam allowance, grading, marker. |
| WIKI-NAP | https://en.wikipedia.org/wiki/Nap_(textile) | EN: nap, pile. |
| MINERVA | https://minervapatterns.com/blog/cutting-fabric-accurately-layouts-nap-and-directional-prints | EN: cutting layout, nap, one-way print, mirrored pieces, fold, grainline. |
| EMBORADO | https://www.emborado.de/en/glossary/cutting-layout/ a https://www.emborado.de/en/glossary/notches-and-pattern-markings/ | EN: cutting layout, notches, pattern markings. |
| APPAREL-RES | https://apparelresources.com/business-news/manufacturing/fabric-utilization-i-cut-order-planning/ | Jen úryvek z vyhledávání: lay plan = cut order plan. |

## Glosář

### Rozložení a výpočet

| Česky (preferováno) | English (preferred) | Vyhnout se (a proč) | Důvěra | Zdroje |
|---|---|---|---|---|
| **polohový plán** (výsledek: nakreslené rozložení dílů na látce) | **marker** (průmysl); **cutting layout** (domácí šití, střihové návody) | EN "lay plan" pro výkres: lay plan je plán nakládání/zakázky (kolik vrstev, jaké velikosti), ne výkres dílů. "Marking up" není zavedený termín. | high (CZ), high (EN marker/cutting layout), medium (lay plan = cut order plan) | BURDA, STARFOS, OCS, EMBORADO, MINERVA, APPAREL-RES |
| **rozložení (střihových dílů na látku)** (běžný popis téhož) | layout / arrangement of pieces on fabric | Není chyba. BURDA sám definuje polohový plán jako "rozložení střihových dílů na látku", takže "rozložení" v UI je srozumitelná lidová varianta. Pozor na EN "layout" = rozvržení stránky. | high | BURDA, EMBORADO |
| **polohování** (činnost: pokládání dílů na látku) | marker making / marker planning | "Marking up" (neustálený). Pozor: ve zdrojích SIKULKY je "polohování střihu" i volněji "položení střihu směrem po niti/po žebru". | high | STARFOS, SIKULKY, OCS |
| **výtěžnost** (podíl plochy dílů na ploše polohy) | **marker efficiency** (jen plocha polohy) / **fabric utilization** (včetně všech ztrát, i konců role) | Rozlišit: aplikace počítá plochu dílů / (využitelná šířka × spotřebovaná délka), tedy marker efficiency, ne celé fabric utilization. "Využití" v UI je v pořádku jako lidový název. | high (výtěžnost, utilization), medium (rozlišení efficiency vs utilization) | STARFOS, TUL-excerpt, OCS |
| **spotřeba (látky / materiálu)** | fabric consumption / yardage (US), "length required" | "Spotřebovaná délka" v UI je správně. Burda upozorňuje, že spotřeba se mění s šířkou a vzorem látky. | high | BURDA |
| **odpad** (technologický odpad = 100 % - výtěžnost) | waste / marker waste | Nezaměňovat s ztrátami na koncích role (end loss), které EN odlišuje. | medium | TUL-excerpt, OCS |
| **mezera mezi díly** | spacing / gap between pieces | Žádný zdroj tento pojem přímo nedefinuje; průmyslový CAD termín (buffer, spacing) jsem neověřil. | low (jako odborný termín), high (jako srozumitelná čeština) | (bez zdroje) |
| **šířka látky** (UI) / **šíře látky** (zdroje) | fabric width | Zdroje píší "šíře látky"; "šířka" je také běžná a srozumitelná. | high | BURDA, SIKULKY |
| **složená napůl, lícem dovnitř** | folded in half, right sides together | Burda: látka je nejčastěji složená na polovinu lícem dovnitř. V UI chybí "lícem dovnitř". | high | BURDA, MINERVA |
| **zakázka** (UI: souhrn střihů k vystříhání) | order / cut order | Pro domácí šičky je "zakázka" firemní. Alternativy "projekt" nebo "co šiju" jsem v žádném zdroji neověřil. | low (alternativy), medium ("zakázka" je průmyslově správně) | TUL-excerpt |
| **nálož** (vrstvy látky položené na sobě) / **list** (jedna vrstva) | lay / spread (stack of plies); ply | Aplikace tyto pojmy nepoužívá; zde kvůli zamezení záměny s "lay plan". | medium | TUL-excerpt, APPAREL-RES |
| **počet kusů** (kolikrát díl vystřihnout) | number to cut / quantity | "Zákroj" jsem v žádném zdroji neověřil. Nepoužívat. | high (počet kusů; vzor "2x" v BURDA), low (zákroj) | BURDA |

### Střih a díly

| Česky (preferováno) | English (preferred) | Vyhnout se (a proč) | Důvěra | Zdroje |
|---|---|---|---|---|
| **střih** (celý střih jako produkt) | (sewing) pattern | "Šablona" pro celý střih (šablona = jednotlivý díl v průmyslu). | high | BURDA, SIKULKY, WIKI-SP |
| **střihový díl** / **díl** (spotřebitelsky též **dílec**) | pattern piece | "Šablona" je průmyslový/školní termín pro díl; pro uživatele raději "díl". "Přířez" v češtině znamená spíš zastřižený kus materiálu. | high | BURDA ("střihové díly", "díl"), SIKULKY ("dílce"), TUL-excerpt ("střihová šablona") |
| **střihová příloha** (papírový arch v časopise) | pattern sheet / pull-out | Netýká se PDF. | high | BURDA |
| **velikost** | size | | high | BURDA, SIKULKY |
| **velikostní řada** (rozsah velikostí střihu) | size range / graded sizes | "Rozměrová řada": žádný zdroj ji pro oděvy nepoužil; TUL píše "velikostní sortiment". Pro uživatele stačí "velikosti". | medium (velikostní řada), low (rozměrová řada) | TUL-excerpt, WIKI-SP |
| **stupňování** (výroba větších/menších velikostí) | grading | "Škálování" je nepřesné (jde o pravidlo posunu bodů, ne o zvětšení). | high | TUL-excerpt, WIKI-SP |
| **střih pro více velikostí najednou** (velikosti nakreslené přes sebe) | multi-size / nested-size pattern | EN "nesting" v aplikaci znamená rozmísťování dílů; "nested sizes" znamená velikosti přes sebe. Zdroj pro "nested sizes" jsem nenašel; Burda popisuje tuto věc popisně. | medium (CZ popis), low ("nested sizes") | BURDA |
| **volitelný díl** | optional piece | | medium (interní termín aplikace) | (bez zdroje) |
| **podšívka** | lining | | high | BURDA ("Futter = podšívka") |
| **výztuha** (nažehlovací; též **vlizelín**) | interfacing | **Vložka** je také běžná v obchodech (nažehlovací vložka), ale ve zdroji BURDA je "výztuha (vlizelín)". "Výztuž" (jak ji normalizuje pieces.ts) je ve zdrojích nenalezena; běžný význam je výztuž konstrukce. | high (výztuha, vlizelín), low (vložka, výztuž) | BURDA |
| **podsádka** | facing | | high | BURDA ("Besatz = podsádka"), SIKULKY |
| **střihová čára** (čára velikosti na archu, podél které se vystřihuje; ve střihu s více velikostmi má každá velikost svou čáru) | pattern line / cutting line (one line per size) | Přesné spojení „střihová čára“ jsem ve zdrojích nenašel doslova; vyhledávání potvrdilo jen věc (v PDF střihu s více velikostmi představuje každá čára jednu velikost, tlusté čáry jsou obrysy dílů). „Konstrukční čára“ je pomocná čára, ne obrys. V UI kroku Velikosti: „Společná pro všechny velikosti“, „Není to střihová čára“. | medium (věc), low (přesné slovní spojení) | prosikulky.cz INFO-rukavice.pdf (https://www.prosikulky.cz/wp-content/uploads/2020/pruvodce/INFO-rukavice.pdf), TUL elearning (druhy čar) |

### Směr, lom, záložky, značky

| Česky (preferováno) | English (preferred) | Vyhnout se (a proč) | Důvěra | Zdroje |
|---|---|---|---|---|
| **směr vlákna** (šipka na dílu); **po niti** (způsob položení) | grainline | "Po vlákně" (app) není ve zdrojích; používá se "po niti" (tkaniny) a "po žebru" (pleteniny). Odborně: referenční linie / směr osnovy. | high (směr vlákna, po niti), medium (směr osnovy) | BURDA ("Fadenlauf = směr vlákna"), SIKULKY ("referenční linie", "po niti", "po žebru"), TUL-excerpt, WIKI-SP |
| **mírné natočení dílu od vlákna** (povolená odchylka dílu od směru vlákna v polohovém plánu, ve stupních) | grain tolerance; slight tilt off the grainline | Vlastní popis funkce, termín „tolerance směru vlákna“ ani anglické „grain tolerance“ jsem ve čtených zdrojích nepotvrdil. UI: „Povolit mírné natočení dílů“, v bublině „natočeno o N° od vlákna“ (EN „tilted N° off the grainline“). Hodnota 3° je z poznámek studenta TUL a čeká na potvrzení (ticket 28). | low | (bez zdroje; ticket 21, 28) |
| **přehyb (látky)**; "střed v přehybu látky"; "na přeložku" | fold; cut on fold | **"Lom"** není ve spotřebitelských zdrojích; Burda i Šikulky píší přehyb/přeložka (Stoffbruch = přehyb látky). Slovo "lom" jsem nenašel v žádném otevřeném zdroji, ačkoli ho aplikace používá a lidé z průmyslu ho mohou znát. | high (přehyb), low (lom) | BURDA, SIKULKY, MINERVA |
| **přídavek na švy** / **švový přídavek** | seam allowance | "Švová záložka" (app): v běžné češtině je **záložka** přídavek na lem (hem allowance), ne na šev. Burda: přídavky na švy a záložky jsou dvě věci. TUL naopak píše "švové záložky". | high (přídavek na švy), medium ("švová záložka" v průmyslu) | BURDA, SIKULKY, TUL-excerpt, WIKI-SP |
| **záložka (na lem)** / **koncová záložka** | hem allowance | Nezaměňovat se švovým přídavkem. | high | BURDA, SIKULKY |
| **značka** (obecně); **zářez** (značka v okraji dílu) | notch (mark on the edge); pattern marking | **Nástřih** je v Burdě slovníčku Einschnitt (nastřižený otvor, např. u légy), v TUL-excerpt "značky (nástřihy)"; nejednoznačné, vyhnout se. "Nastřižení" jsem nenašel. "Zářez" je běžný slovníkový výraz, ale žádný otevřený zdroj o střizích jsem pro něj nenašel. | high (značka), low (zářez) | BURDA, SIKULKY, EMBORADO, WIKI-SP |
| **zrcadlově** ("pravé a levé díly stříháme zrcadlově") | mirrored; cut mirrored / a pair | "Obráceně", "převráceně" (nejednoznačné). | high | BURDA (navod-113-03-2018), MINERVA |
| **pár (pravý a levý díl)** | pair (left and right) | | medium | BURDA |
| **směr vlasu** (samet, manšestr, froté) | nap direction / pile direction | | high | BURDA, WIKI-NAP |
| **směr vzoru** (potisk s horem a spodkem) | one-way / directional print | "Jednosměrný vzor" (app, UI): Burda píše "látka s jedním směrem vzoru". Doslovný ekvivalent "jednosměrný" jsem ve zdrojích nenašel, ale je srozumitelný. | high (směr vzoru, vlasu), medium (jednosměrný) | BURDA, MINERVA |
| **líc / rub** (lícová / rubová strana látky) | right side / wrong side | "Pravá/levá strana" je v Burdě jen ve slovníčku z němčiny (rechte Seite = pravá strana, líc); v textu návodů Burda píše lícová/rubová. | high (CZ), medium (EN: obecně známé, ve čteném zdroji nebylo definováno) | BURDA |
| **pevný okraj látky** | selvage (selvedge) | "Krajový" (Šikulky: "pevné okraje"). | high | BURDA ("Webkante = pevný okraj látky"), SIKULKY |
| **tkanina** / **pletenina** | woven fabric / knit fabric | "Úplet" je jen jeden druh pleteniny (zde ale Šikulky používají "úplet" běžně). EN termíny jsou obecně známé; ve čteném zdroji nebyly definovány. | high (CZ), medium (EN) | SIKULKY |

### PDF střihy (tištěné po stránkách)

| Česky (preferováno) | English (preferred) | Vyhnout se (a proč) | Důvěra | Zdroje |
|---|---|---|---|---|
| **elektronický střih**; **střih ve formátu PDF pro tisk na A4** | PDF pattern; print-at-home pattern; tiled PDF pattern | "Dlaždicový" tisk: žádný český zdroj o střizích tento výraz nepoužívá. | high (elektronický střih), low (dlaždicový) | BURDA, SIKULKY |
| **stránka** / **list** (jedna vytištěná A4) | page / sheet / tile | "Dlaždice" (app, PdfImport.tsx:587, 597): v českých střihových zdrojích nenalezeno. "Arch" je spíš papírenský. | medium | BURDA, SIKULKY |
| **kontrolní čtverec** (též "kontrolní čtvereček") | test square (též gauge square) | | high | BURDA ("Kontrollquadrat/test square", 10 cm), SIKULKY ("5x5 cm", "kontrolní čtverec") |
| **vytisknout v nezmenšeném měřítku (100 %)** | print at actual size / 100 % scale | "Přizpůsobit stránce" musí být vypnuto. | high | SIKULKY, BURDA |
| **slepit střih**; **kompletace střihu** | assemble the pattern | "Sestavení" je v pořádku obecně; zdroje používají slepit/kompletovat. | high | BURDA ("Stříhání a lepení", "kompletování"), SIKULKY (jak-slepit-strih) |
| **značky na okrajích stránek (písmena/čísla v rozích)** | registration / alignment marks | | high | BURDA, SIKULKY |
| **překryv** / **přesah** (okraj stránky) | overlap | Burda: "přesah" (horní hrana papíru). | medium | BURDA |
| **varianta / verze** (např. krátký rukáv) | version / view (např. "View A") | "Možnosti dílu" (app) zní nepřirozeně. Šikulky píší "verze" ("zjednodušená verze", "verze s podsádkou"). "Provedení" jsem nepotvrdil. | low-medium | SIKULKY, EMBORADO ("view") |

### Doplněno při anglické lokalizaci (ticket 17)

Ověřeno jen vyhledáváním (2026-11-17); stránky s nízkou kvalitou jsem nepoužil. Zdroje: SEWCALCS https://sewcalcs.pages.dev/reference/fabric-widths a MELLY https://mellysews.com/?p=22770 (jen úryvky z vyhledávání, stránky neotevřeny), MINDY https://mindymakes.com/what-is-a-yard-of-fabric-conversion-table-and-related-questions-a-beginners-guide/.

| Česky | English (použito v UI) | Poznámka | Důvěra | Zdroje |
|---|---|---|---|---|
| **šířka látky 44 / 54 / 60 palců** (předvolby v palcích) | fabric width 44/45", 54", 58-60" | Bavlna na patchwork bývá 44/45", oděvní a dekorační 54-60". Zdroje se v přesných číslech rozcházejí; předvolby 44, 54, 60 jsou zaokrouhlené. Použitelná šířka je menší než šířka role (kraje). | medium | SEWCALCS, MELLY, MINDY |
| **délka ke koupi (yardy)** | yardage; length to buy in yards (yd) | 1 yd = 36 in = 0,9144 m. Aplikace zaokrouhluje nahoru na 0,01 yd. | medium (termín yardage), high (převod) | MELLY, MINDY |
| **po niti (podélně) / napříč** | lengthwise grain / crosswise grain (crossgrain) | Podélná nit je rovnoběžná s krajem, napříč je kolmá a více se natahuje. | medium | MELLY, MINDY |
| **využití (podíl plochy)** | efficiency | V UI "Efficiency" jako zkratka za marker efficiency; pro domácí šičky je to srozumitelnější než "utilization". | medium | OCS |
| **varianta dílu (např. krátký rukáv)** | version (of a piece) | Z "version / view" v glosáři výše; "variant" a "options" se v anglických střizích nepoužívají. | low-medium | EMBORADO, SIKULKY |
| **Co šiju** (seznam střihů k vystříhání) | What I'm sewing | Vlastní název aplikace, ne obor; záměrně ne "order". | low | (bez zdroje) |

## Notes for UI wording

Řazeno podle důležitosti. "Navrhuji" = rozhodnutí patří vlastníkovi produktu.

1. **"Lom" (PdfPieces.tsx:149, 153, 184; OrderEditor.tsx:29; PdfSave.tsx:9, 50; prepare.ts:106; README Import PDF)**: žádný spotřebitelský zdroj slovo nepoužívá; Burda i Šikulky píší **přehyb** (látky) nebo **přeložka**. Navrhuji "Přehyb (stříhá se na přeložené látce)". Důvěra v "přehyb": high. Důvěra, že "lom" je chyba: low (v průmyslu může existovat; neověřeno). Pozn.: slovo "lom" musí zůstat v regexu `FOLD` v `src/pdf/pieces.ts:51`, protože rozpoznává text z cizích PDF.
2. **"Švová záložka" (App.tsx:214; OrderEditor.tsx:25, 33; PdfSave.tsx:34-35; prepare.ts:77, 96; README)**: Burda a Šikulky: **přídavek na švy / švový přídavek**; "záložka" znamená přídavek na lem. TUL excerpt "švové záložky" existuje, takže to není chyba, jen průmyslová varianta. Navrhuji "Přídavek na švy". Důvěra: high (přídavek), medium (záložka v průmyslu).
3. **"po vlákně" (fields.tsx:17)**: zdroje používají "po niti" (tkaniny) nebo "ve směru vlákna". Navrhuji "0° / 180° · po niti". Důvěra: medium.
4. **"Kolik cm jste naměřila?" (PdfImport.tsx:318)**: ženský rod. Neutrální: "Kolik cm vám vyšlo?" (jazyková poznámka, ne terminologická).
5. **"Dlaždic v jednotlivých řádcích" a "Krok dlaždic · překryv" (PdfImport.tsx:587, 597), "Složený arch" a "Celý arch" (PdfImport.tsx:266, 276)**: české střihové zdroje mluví o **stránkách / listech** a o **slepení / sestavení střihu**. Navrhuji "Stránek v jednotlivých řádcích", "Slepený střih". Důvěra: medium.
6. **"Možnosti dílu" / "Možnosti" (PdfPieces.tsx:171-189, 236)**: hodí se spíš "Varianta" / "Verze" (např. "krátký rukáv"). Důvěra low-medium; potřebuje rozhodnutí.
7. **"Zakázka" (App.tsx:188 a dále)**: průmyslově správné, ale pro domácí šičku firemní. Alternativa není ověřena (žádný zdroj), nechávám na vlastníkovi. Důvěra: low.
8. **"Vaše rozložení" / "plán rozložení" (App.tsx:171, 239; Layout.tsx:94 "Využití")**: srozumitelné. Pro odbornější slovník lze "Polohový plán" (Burda sám tak nazývá výkres) a "Výtěžnost" (TUL/STARFOS). Obojí je high; je to otázka cílové skupiny, ne chyba.
9. **"Zachovat směr (vlas, jednosměrný vzor)" (App.tsx:208)**: Burda rozlišuje **směr vlasu** (samet, manšestr) a **směr vzoru** (potisk). Text je správný; "jednosměrný vzor" je srozumitelný, ale doslovně ve zdrojích není. Důvěra: medium.
10. **"Složená napůl" (App.tsx:206)**: doplnit "lícem dovnitř" (Burda). Jen drobné zpřesnění.
11. **Materiál "výztuž" (pieces.ts:60)**: normalizovaný popisek je "výztuž", zdroje píší **výztuha** (Burda: "výztuha (vlizelín)"). Regex `^výztu` odpovídá oběma tvarům, takže stačí změnit zobrazený popisek na "výztuha". Důvěra: medium-high.
12. **"zákroj", "rozměrová řada", "nastřižení"**: neverifikováno, v aplikaci se nevyskytuje. Nezavádět, dokud je nepotvrdí odborník.

Co je správně a nic nemění: "Mezera mezi díly" (App.tsx:215-216, prepare.ts:56), "Spotřebovaná délka" (Layout.tsx:93), "Délka ke koupi" (Layout.tsx:180), "Zrcadlově" (Layout.tsx:13, 176, 182), "Směr vlákna" (PdfPieces.tsx:154), "Kontrolní čtverec" (PdfImport.tsx:301-327), "podšívka" (PdfPieces.tsx:138), "Počet kusů" (PdfPieces.tsx:23), "tkanina/pletenina". Plural "kus/kusy/kusů" (prepare.ts:67) je správně.

## Doporučení k ověření odborníkem

Jedna konzultace s někým z oboru (krejčová, studentka oděvnictví TUL) by uzavřela: "lom" vs "přehyb", "zářez" vs "značka", "rozměrová/velikostní řada", "zákroj", "Varianta/Verze" a "Zakázka". Elearning TUL je za přihlášením; pokud vlastník získá přístup, hlavní zdroje jsou VOD_4 (Polohování) a VOD_5 (Oddělovací proces).
