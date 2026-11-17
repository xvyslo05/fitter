# Hlavní obrazovka: UX rozbor a návrh zjednodušení

Stav k 2026-11-17. Podklad pro tiket [13](tickets/13-main-screen-simplification.md).

**Jak rozbor vznikl.** Obrazovku jsem přeložil ze zdrojových souborů (`src/ui/App.tsx`, `Library.tsx`, `OrderEditor.tsx`, `Layout.tsx`, `fields.tsx`, `src/styles.css`, `index.html`). V prohlížeči jsem ji nespouštěl, protože v pracovním stromu právě probíhá přejmenování z tiketu 23 a běžící aplikace by ukazovala mezistav. Čísla řádků platí pro pracovní strom v době čtení a po dokončení tiketu 23 se mohou o pár řádků posunout.

**Terminologie.** Odborné výrazy beru z `docs/glossary.md`. Kde navrhuji slovo, které glosář neobsahuje, je to výslovně označeno jako „lidový popisek, neověřeno".

**Rozsah.** Jen hlavní obrazovka. Průvodce importem PDF (`PdfImport.tsx`, `PdfPieces.tsx`, `PdfSave.tsx`) se nemění.

---

## 1. Co uživatelka dnes vidí a dělá

### 1.1 Pořadí na obrazovce (desktop, šířka nad 850 px)

Shora dolů, levý sloupec 315–390 px, vpravo výsledek (`styles.css:400-405`):

| # | Blok | Co obsahuje | Zdroj |
|---|---|---|---|
| A | Hlavička | logo, „Malý pomocník pro velké plány", odznak „Vše zůstává u vás", výběr „Vzhled" (Automaticky / Světlý / Tmavý) | `App.tsx:165-169` |
| B | Úvod | nadtitulek „Od střihu k látce", nadpis „Střihy na svém místě.", věta „Rozložte díly, využijte látku a pusťte se do šití.", štítek „Méně odstřižků. Více možností." | `App.tsx:174` |
| C | Oznámení | varování úložiště, zprávy po akcích, dotaz na obnovení zálohy | `App.tsx:175-182` |
| D | Knihovna střihů (bez čísla kroku) | velká přetahovací zóna „Vaše střihy mají místo tady · Přetáhněte soubory .json (i zálohu) nebo je vyberte." s tlačítkem „Importovat střihy"; pod ní „Importovat PDF…"; pod ní odkazy „Zálohovat vše do souboru" a „Obnovit ze zálohy"; seznam střihů (název, autor, počet dílů, velikosti) s „+ Přidat" a „×"; věta o soukromí | `Library.tsx:10-30` |
| E | 01 Co šiju | karty řádků: výběr „Střih", „×", „Velikost", „Množství ×", zaškrtávátko „Přidat přídavek na švy", sbalené „Díly a otáčení · N vybráno"; dole „+ Přidat další střih" | `App.tsx:188-194`, `OrderEditor.tsx:12-63` |
| F | 02 Látky | pro každý materiál: název a „N umístění", přepínač „Role · spočítat délku" / „Kus · pevná délka", „Šířka · materiál", případně „Délka · materiál", „Složená napůl", „Zachovat směr (vlas, jednosměrný vzor)" | `App.tsx:195-212` |
| G | 03 Nastavení | „Přídavek na švy", „Mezera mezi díly" s nápovědou a odkazem „Výchozí", „Výchozí otáčení", „Páry zrcadlově", sbalené „Přesnost a délka hledání" (Krok rastru, Čas na materiál, Náhodné semínko) | `App.tsx:213-228` |
| H | Spuštění | chyba vstupu, tlačítko „Vytvořit polohový plán ↗" (při výpočtu „■ Zastavit 3.2 s"), věta „Hledání až 5 s na každý materiál." Na desktopu přilepené ke spodku okna | `App.tsx:230-236`, `styles.css:711-717` |
| I | Váš polohový plán (pravý sloupec) | nadpis, „Počet materiálů: N", vysvětlení pojmu, stav výpočtu, varování o zastaralém výsledku, „Poznámky ke stříhání", karty materiálů, poznámka pod čarou | `App.tsx:238-249` |
| J | Karta materiálu | nadtitulek „Jedna vrstva" / „Dvě vrstvy · složená látka", název, odznak „12 / 12 umístěno", tři čísla (Rozměr, Spotřebovaná délka, Využití), nákres s pravítky a kótami pod ukazatelem, legenda a „N průchodů", „Nevešlo se (N)", „Export SVG", „Export PNG", „Vytisknout plán" | `Layout.tsx:89-193` |
| K | Patička | tři věty, poslední „Bez účtu. Bez odesílání dat." | `App.tsx:253` |

Na šířce do 850 px je vše v jednom sloupci, výsledek až pod formulářem, tlačítko spuštění už není přilepené (`styles.css:1122-1160`). Mezi 561 a 850 px jsou panely formuláře ve dvou sloupcích: Knihovna přes celou šířku, pod ní vedle sebe „Co šiju" a „Látky", „Nastavení" samo na dalším řádku (`styles.css:1127-1133`).

### 1.2 Cesta nové uživatelky krok za krokem

1. Otevře stránku. V seznamu „Co šiju" už je řádek s ukázkovým střihem (`App.tsx:21-23`), vpravo prázdný stav s větou „Demo střih je připravený k vyzkoušení." (`Layout.tsx:206`).
2. Chce svůj střih. Největší prvek nahoře ji vybízí k přetažení souborů `.json`, které nemá. Tlačítko „Importovat PDF…" je menší a až pod zónou.
3. Projde průvodce PDF. Po uložení se nahoře objeví zpráva „Střih … je uložený v knihovně. Stejné ID nahrazuje předchozí verzi. Tip: zálohujte si střihy do souboru." (`App.tsx:109`). Střih je v knihovně, ale v seznamu „Co šiju" pořád zůstává ukázkový střih.
4. Musí pochopit, že střih dostane do plánu jednou ze tří cest: „+ Přidat" v knihovně (`Library.tsx:27`), přepnutím výběru „Střih" v existujícím řádku (`OrderEditor.tsx:13-18`), nebo „+ Přidat další střih", které ale přidá vždy první střih v seznamu, tedy ukázkový (`App.tsx:193`).
5. Zvolí velikost a množství. Volbu varianty (například délku rukávu) a volitelné díly najde jen po rozbalení „Díly a otáčení", kde jsou smíchané s výběrem otáčení u každého dílu (`OrderEditor.tsx:28-61`).
6. U látky zvolí „Role" nebo „Kus", přepíše šířku 140, případně zaškrtne složení a směr.
7. Projde „Nastavení" se čtyřmi viditelnými volbami a třemi schovanými.
8. Stiskne „Vytvořit polohový plán". Na šířce pod 900 px stránka sjede k výsledku (`App.tsx:153`).
9. Ve výsledku vidí nákres a tři čísla. Odpověď „kolik látky koupit" na obrazovce není: „Délka ke koupi: alespoň N cm" se vypíše jen při tisku (`Layout.tsx:178-180`).
10. Když cokoli změní, objeví se varování, že výsledek patří k předchozímu výpočtu, a musí spustit výpočet znovu (`App.tsx:242`).

---

## 2. Problémy podle závažnosti

### Kritické (uživatelka nesplní úkol nebo přijde o data)

| # | Problém | Kde |
|---|---|---|
| K1 | **Na obrazovce chybí odpověď „kolik látky koupit".** Hlavní výstup aplikace je k dispozici jen ve vytištěné verzi. Na obrazovce je „Spotřebovaná délka 141,3 cm" bez zaokrouhlení a bez věty, co s tím. | `Layout.tsx:92-94` proti `Layout.tsx:178-180` |
| K2 | **První a největší prvek je pro soubory, které uživatelka nemá.** Zóna pro `.json` je nahoře, import PDF je druhořadé tlačítko pod ní. | `Library.tsx:11-22` |
| K3 | **Smazání střihu bez dotazu a bez návratu.** Jedno klepnutí na „×" smaže střih z úložiště a odebere jeho řádky z plánu. Zpráva radí „Původní soubor můžete znovu importovat", ale střih z PDF žádný soubor nemá, pokud si ho uživatelka sama nestáhla. „×" je hned vedle „+ Přidat". | `Library.tsx:27-28`, `App.tsx:115-122` |
| K4 | **Varianty a volitelné díly jsou schované.** Volba délky rukávu nebo vynechání kapsy mění, co se bude stříhat, ale je uvnitř sbaleného „Díly a otáčení" mezi výběry otáčení. | `OrderEditor.tsx:28-42` |

### Vysoké (zdržuje, mate, vede k chybnému výsledku)

| # | Problém | Kde |
|---|---|---|
| V1 | **Tři cesty, jak přidat střih do plánu, a jedna z nich přidává ukázkový střih.** „+ Přidat další střih" bere `patterns[0]`, což je vždy demo. | `App.tsx:193`, `Library.tsx:27`, `OrderEditor.tsx:13-18` |
| V2 | **Knihovna a „Co šiju" jsou dva panely pro jedno rozhodnutí** („který střih šiju"). Knihovna navíc nemá číslo kroku, takže číslování 01–03 začíná až druhým panelem. | `Library.tsx:10`, `App.tsx:188` |
| V3 | **Přídavek na švy je na třech místech.** Zaškrtávátko u střihu, hodnota v „Nastavení", návrat k výchozímu ve sbaleném „Díly a otáčení". Z řádku není vidět, kolik centimetrů se přidá. | `OrderEditor.tsx:24-25`, `App.tsx:214`, `OrderEditor.tsx:31-33` |
| V4 | **Odborné a technické volby jsou vidět hned.** „Výchozí otáčení" s volbami „0° / 180° · po niti" a „0° / 90° / 180° / 270°", „Páry zrcadlově", pod tím „Krok rastru", „Čas na materiál", „Náhodné semínko". | `App.tsx:218-227`, `fields.tsx:16-18` |
| V5 | **Zprávy se objevují nahoře, akce je dole.** Chyba po stisku tlačítka nebo zpráva po smazání se vypíše nad formulářem, na mobilu mimo obrazovku. | `App.tsx:176-177` proti `App.tsx:231-235` |
| V6 | **Na tabletu a mobilu není hlavní tlačítko vidět.** Do 850 px přestává být přilepené, je až pod třemi panely. | `styles.css:1157-1159` |
| V7 | **Malé písmo a malé dotykové plochy.** Popisky a nápovědy mají 10–12 px, hlavní tlačítko 13 px, věta pod ním 10 px, varování na mobilu 10 px. Textová tlačítka („+ Přidat") mají výšku 34 px, ikonová („×") 36 px a šířku 30 px. | `styles.css:728`, `742-743`, `491`, `541-542`, `1272-1274` |
| V8 | **Látka: přepínač mluví jazykem programu.** „Role · spočítat délku" a „Kus · pevná délka" popisují výpočet, ne situaci („teprve koupím" proti „mám doma"). Šířka nemá předvolby. Popisek pole opakuje název materiálu („Šířka · hlavní"). | `App.tsx:200-205` |
| V9 | **Chybové hlášky s technickými slovy.** „výpočetní worker", „větší krok rastru", „ID vestavěného demo střihu je vyhrazené", „Stejná ID nahrazují předchozí verzi", „Neplatný soubor JSON". | `App.tsx:154`, `149`, `77`, `108`, `84`, `109`, `82` |

### Střední (šum, který krade pozornost)

| # | Problém | Kde |
|---|---|---|
| S1 | Technické počty bez významu pro uživatelku: „N umístění", „N průchodů", „Počet materiálů: N". | `App.tsx:199`, `Layout.tsx:176`, `App.tsx:239` |
| S2 | Tři stejně výrazná tlačítka výstupu („Export SVG", „Export PNG", „Vytisknout plán"). Tisk tiskne celou stránku, ale tlačítko je v každé kartě materiálu znovu. | `Layout.tsx:185-191` |
| S3 | Sdělení o soukromí třikrát: odznak v hlavičce, věta v knihovně, patička. | `App.tsx:166`, `Library.tsx:30`, `App.tsx:253` |
| S4 | Úvodní blok (čtyři texty) a výběr „Vzhled" v hlavičce zabírají první obrazovku, hlavně na mobilu. | `App.tsx:167-169`, `174` |
| S5 | Na šířce 561–850 px se čte cikcak: Knihovna, pak vedle sebe „Co šiju" a „Látky", „Nastavení" vlevo dole. | `styles.css:1127-1133` |
| S6 | „Složená napůl" bez „lícem dovnitř" a bez vysvětlení, k čemu to je (glosář, poznámka 10). | `App.tsx:206-207` |
| S7 | Nápověda k mezeře říká „nechte 0,5 cm", přesto je pole stále viditelné. Pole, jehož nápověda radí na něj nesahat, patří do upřesnění. | `App.tsx:215-217` |
| S8 | „Množství" u střihu není jasné (kusů oblečení, nebo dílů?). „Počet kusů" je v glosáři obsazený pro počet vystřižení jednoho dílu, takže ho zde použít nejde. | `OrderEditor.tsx:23` |
| S9 | Po importu PDF zůstane v plánu ukázkový střih; nový střih se do plánu sám nedostane. | `App.tsx:107-114` |

### Poznámky pro tiket 23 (mimo tento návrh, jen hlášení)

- `src/model/prepare.ts:88` stále obsahuje „Množství v zakázce".
- `App.tsx:120` píše „z knihovny i z plánu", jinde je „seznam Co šiju".

---

## 3. Návrh zjednodušení

### 3.1 Zásady

1. **Tři kroky, které odpovídají otázkám uživatelky:** co šiju, na jakou látku, kolik jí koupit a jak díly položit.
2. **Jedno hlavní tlačítko na krok.** V kroku 1 „Přidat střih z PDF", dole „Vytvořit polohový plán".
3. **Jedno místo pro všechno, co se běžně nemění:** blok „Upřesnit". Není to odkladiště: v záhlaví vždy ukazuje, co je změněné proti výchozímu, aby schovaná hodnota nezůstala neviditelná.
4. **Nic se neruší.** Každá dnešní funkce má v tabulce 3.5 nové místo.
5. **Stránka zůstává jedna.** Žádný vícestránkový průvodce (souhlasím s tiketem 13: nehrozí ztráta stavu a na desktopu je vidět formulář i výsledek).

### 3.2 Pořadí obrazovky

1. Hlavička: logo a odznak „Vše zůstává u vás". Výběr „Vzhled" se stěhuje do patičky.
2. Jedna úvodní věta místo čtyř textů.
3. Oznámení (beze změny umístění pro obnovení zálohy a varování úložiště; zprávy po akcích se navíc ukážou u místa akce, viz 3.4).
4. **1 · Co šiju**: řádky plánu, pod nimi „Moje střihy" (dnešní Knihovna) s hlavním tlačítkem „Přidat střih z PDF".
5. **2 · Látka**: pro každý materiál jedna karta.
6. **3 · Polohový plán**: sbalené „Upřesnit" a tlačítko „Vytvořit polohový plán".
7. Výsledek: nahoře rámeček „Kolik látky koupit", pod ním karty s nákresem.
8. Patička: věta o soukromí, „Vzhled".

Panel „03 Nastavení" jako samostatný krok zaniká. Jeho obsah se dělí: výše přídavku na švy je vidět u střihu (krok 1), vše ostatní je v „Upřesnit".

### 3.3 Náčrty

**Desktop (nad 850 px), dva sloupce**

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ f fitter.                                               ● Vše zůstává u vás    │
├────────────────────────────────────────────────────────────────────────────────┤
│ Rozmístěte díly střihu na látku a zjistěte, kolik jí koupit.                   │
│                                                                                │
│ ┌─ 1 · Co šiju ──────────────────┐  ┌─ Váš polohový plán ────────────────────┐ │
│ │ ┌────────────────────────────┐ │  │ ┌─ Kolik látky koupit ───────────────┐ │ │
│ │ │ Střih   [Mikina Raglan  ▾] │ │  │ │ Hlavní látka   alespoň 1,45 m      │ │ │
│ │ │ Velikost [M ▾]  Kolikrát[1]│ │  │ │                šíře 140 cm         │ │ │
│ │ │ Rukáv   [dlouhý        ▾]  │ │  │ │ Podšívka       alespoň 0,60 m      │ │ │
│ │ │ ☑ Přidat přídavek na švy   │ │  │ │                šíře 140 cm         │ │ │
│ │ │   1 cm · změnit            │ │  │ │ Bez rezervy na sražení a vzor.     │ │ │
│ │ │ ▸ Díly (7 z 9)    Odebrat  │ │  │ │ [Vytisknout plán]                  │ │ │
│ │ └────────────────────────────┘ │  │ └────────────────────────────────────┘ │ │
│ │ Moje střihy (3)                │  │ ┌─ Hlavní látka ─────────────────────┐ │ │
│ │ [ Přidat střih z PDF ]         │  │ │ Jedna vrstva · všech 12 dílů       │ │ │
│ │ Mikina Raglan    [Do plánu][⋯] │  │ │ ┌────────────────────────────────┐ │ │ │
│ │ Šaty Dandelion   [Do plánu][⋯] │  │ │ │                                │ │ │ │
│ │ Ukázkový střih   [Do plánu]    │  │ │ │         nákres s kótami        │ │ │ │
│ │ ▸ Záloha a soubory             │  │ │ │                                │ │ │ │
│ └────────────────────────────────┘  │ │ └────────────────────────────────┘ │ │ │
│ ┌─ 2 · Látka ────────────────────┐  │ │ ↓ Směr vlákna  ▨ ↔ Zrcadlově       │ │ │
│ │ Hlavní látka                   │  │ │ Využití 71 % · ▸ Podrobnosti       │ │ │
│ │ (•) Teprve koupím ( ) Mám kus  │  │ │ [Uložit obrázek]  ▸ Další formáty  │ │ │
│ │ Šíře [140] cm  110 140 150     │  │ └────────────────────────────────────┘ │ │
│ │ ☐ Složená napůl, lícem dovnitř │  │ Poznámky ke stříhání …                 │ │
│ │ ☐ Látka má vlas nebo směr vzoru│  └────────────────────────────────────────┘ │
│ └────────────────────────────────┘                                             │
│ ┌─ 3 · Polohový plán ────────────┐                                             │
│ │ ▸ Upřesnit · výchozí nastavení │                                             │
│ │ [ Vytvořit polohový plán    ↗ ]│  ← přilepené ke spodku okna                 │
│ └────────────────────────────────┘                                             │
├────────────────────────────────────────────────────────────────────────────────┤
│ fitter. · Střihy zůstávají v tomto prohlížeči. · Vzhled [Automaticky ▾]        │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Tablet (561–850 px), jeden sloupec, bez cikcaku**

```
┌──────────────────────────────────────────────┐
│ f fitter.                ● Vše zůstává u vás │
│ Rozmístěte díly střihu na látku …            │
│ ┌─ 1 · Co šiju ────────────────────────────┐ │
│ │ Střih [Mikina Raglan ▾]                  │ │
│ │ Velikost [M ▾]  Kolikrát [1]  Rukáv [▾]  │ │
│ │ ☑ Přidat přídavek na švy 1 cm · změnit   │ │
│ │ ▸ Díly (7 z 9)                  Odebrat  │ │
│ │ Moje střihy (3)   [ Přidat střih z PDF ] │ │
│ │ Mikina Raglan [Do plánu][⋯] │ Šaty … [⋯] │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ 2 · Látka ──────────────────────────────┐ │
│ │ Hlavní látka        │ Podšívka           │ │
│ │ (•) Teprve koupím   │ (•) Teprve koupím  │ │
│ │ Šíře [140] 110 140… │ Šíře [140] …       │ │
│ └──────────────────────────────────────────┘ │
│ ▸ Upřesnit · výchozí nastavení               │
│ ┌─ Váš polohový plán ──────────────────────┐ │
│ │ Kolik látky koupit …                     │ │
│ │ nákres …                                 │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [ Vytvořit polohový plán                 ↗ ] │ ← pevná lišta dole
└──────────────────────────────────────────────┘
```

Karty materiálů mohou být v kroku 2 vedle sebe; panely kroků jdou vždy pod sebou.

**Mobil (do 560 px)**

```
┌──────────────────────────┐
│ f fitter.   ● U vás      │
│ ┌─ 1 · Co šiju ────────┐ │
│ │ Střih [Mikina … ▾]   │ │
│ │ Velikost [M ▾]       │ │
│ │ Kolikrát [1]         │ │
│ │ Rukáv [dlouhý ▾]     │ │
│ │ ☑ Přídavek na švy    │ │
│ │   1 cm · změnit      │ │
│ │ ▸ Díly (7 z 9)       │ │
│ │ ▸ Moje střihy (3)    │ │
│ └──────────────────────┘ │
│ ┌─ 2 · Látka ──────────┐ │
│ │ Hlavní látka         │ │
│ │ (•) Teprve koupím    │ │
│ │ ( ) Mám kus          │ │
│ │ Šíře [140] cm        │ │
│ │ [110] [140] [150]    │ │
│ │ ☐ Složená napůl …    │ │
│ │ ☐ Vlas, směr vzoru   │ │
│ └──────────────────────┘ │
│ ▸ Upřesnit               │
│ ┌─ Váš polohový plán ──┐ │
│ │ Kolik látky koupit   │ │
│ │ Hlavní l.  1,45 m    │ │
│ │ nákres (posun prstem)│ │
│ └──────────────────────┘ │
├──────────────────────────┤
│ [Vytvořit polohový plán] │ ← pevná lišta dole
└──────────────────────────┘
```

Na mobilu je „Moje střihy" sbalené, pokud v plánu už nějaký řádek je; rozbalené, když je plán prázdný. Podle rozhodnutí D7 je mobil určený k prohlížení a výpočtu; tlačítko „Přidat střih z PDF" tam zůstává, ale průvodce se pro mobil neupravuje.

### 3.4 Co se spojí, schová, přesune a odstraní

**Spojí se**

- Knihovna a „Co šiju" do jednoho panelu „1 · Co šiju". Nahoře řádky plánu, pod nimi „Moje střihy". Důvod: obojí odpovídá na otázku „který střih šiju" (V2).
- Tři cesty přidání do jedné viditelné: „Do plánu" u střihu v seznamu. Tlačítko „+ Přidat další střih" zůstává, ale místo přidání ukázkového střihu posune pohled na „Moje střihy" (na mobilu je rozbalí). Výběr „Střih" v řádku zůstává, protože zároveň slouží jako název řádku.
- Výše přídavku na švy se ukáže u zaškrtávátka: „Přidat přídavek na švy · 1 cm · změnit". „Změnit" otevře „Upřesnit" a zaměří pole. Hodnota je jedna pro všechny střihy, proto se needituje v řádku (V3).
- Tři sdělení o soukromí do dvou: odznak v hlavičce a jedna věta v patičce.
- Tlačítko tisku z každé karty do jednoho v rámečku „Kolik látky koupit" (tisk stejně tiskne všechny materiály).

**Schová se pod „Upřesnit"** (jeden blok v kroku 3, tři podnadpisy)

| Podnadpis | Volby | Dnes |
|---|---|---|
| Přídavky a mezery | Přídavek na švy (cm), Mezera mezi díly (cm) s odkazem „Výchozí" | `App.tsx:214-217` |
| Otáčení dílů | Jak smí být díly otočené, Pravý a levý díl stříhat zrcadlově | `App.tsx:218-220` |
| Hledání | Přesnost, Jak dlouho hledat, Číslo pokusu | `App.tsx:221-227` |

Záhlaví bloku ukazuje stav: „Upřesnit · výchozí nastavení", nebo „Upřesnit · změněno: mezera 0,3 cm, hledání 20 s" s odkazem „Vrátit výchozí". Bez toho by sbalení skrylo hodnotu, která ovlivňuje výsledek.

**Schová se uvnitř řádku střihu**

- „Díly (7 z 9)": zaškrtávací seznam dílů, poznámky k dílům a ke střihu. Sbalené.
- Uvnitř něj „Otáčení jednotlivých dílů": výběr otáčení u každého dílu. Sbalené, s počtem změněných dílů v záhlaví.
- „Obnovit přídavky na švy podle střihu" se přesouvá hned pod zaškrtávátko přídavku (zobrazí se jen po ruční změně, jako dnes).

**Vytáhne se ven** (dnes schované, má být vidět)

- Výběr varianty (například „Rukáv: krátký / dlouhý / vynechat") z „Díly a otáčení" přímo pod velikost (K4).
- Délka ke koupi z tiskové verze na obrazovku (K1).

**Přesune se**

- JSON zóna, „Zálohovat vše do souboru", „Obnovit ze zálohy" do sbaleného „Záloha a soubory" pod seznamem střihů. Přetažení souboru funguje nad celým panelem „Moje střihy", takže ho není třeba rozbalovat.
- „Vzhled" z hlavičky do patičky.
- „N umístění" (krok 2) do věty v kartě výsledku („všech 12 dílů"). „N průchodů", „Rozměr" a přesná spotřebovaná délka do sbalených „Podrobnosti" v kartě výsledku.
- „Export SVG" pod „Další formáty"; „Export PNG" se přejmenuje na „Uložit obrázek" a zůstává viditelné.

**Odstraní se** (jen texty, žádná funkce)

- Nadtitulek „Od střihu k látce", štítek „Méně odstřižků. Více možností.", „Malý pomocník pro velké plány" v hlavičce. Nadpis a jedna věta zůstanou.
- „Počet materiálů: N" (je vidět z počtu karet).
- Věta „Hledání až 5 s na každý materiál." pod tlačítkem. Informace je v „Upřesnit · Hledání"; během výpočtu zůstává počítadlo času.
- Opakovaná věta o soukromí v knihovně.

**Chování, které se mění**

- Smazání střihu se nejdřív zeptá přímo v řádku (viz 4.2). Smazání je pod „⋯", ne vedle „Do plánu".
- Po uložení střihu z PDF: pokud plán obsahuje jen nedotčený řádek ukázkového střihu, nahradí ho nový střih; jinak se nový střih přidá jako další řádek. Zpráva to řekne (S9). Toto je změna chování, potřebuje souhlas vlastníka (otázka O2).
- Zprávy po akci se ukážou u místa akce: chyba spuštění nad tlačítkem (to už dnes platí pro chybu vstupu, `App.tsx:230`), zpráva o střihu v panelu „Moje střihy". Horní pruh zůstává pro obnovení zálohy a varování úložiště.
- Zastaralý výsledek: beze změny (varování a ruční spuštění). Automatické přepočítání nedoporučuji: výpočet trvá sekundy na každý materiál a běžel by při každém úhozu.

### 3.5 Funkce → kde bude

| Dnešní funkce | Dnes | Nově | Viditelnost |
|---|---|---|---|
| Import střihu z PDF | Knihovna, druhé tlačítko | Krok 1, „Moje střihy", hlavní tlačítko „Přidat střih z PDF" | vidět |
| Import střihu ze souboru `.json` (výběr) | Knihovna, zóna | „Záloha a soubory" → „Nahrát soubor střihu nebo zálohy" | sbalené |
| Import přetažením | zóna | celý panel „Moje střihy" přijímá přetažení | vidět při tažení |
| Zálohovat vše do souboru | Knihovna | „Záloha a soubory" | sbalené |
| Obnovit ze zálohy, volba „Přidat k mým střihům" / „Nahradit vše" | Knihovna, horní pruh | „Záloha a soubory", horní pruh beze změny | sbalené |
| Seznam střihů (název, autor, počet dílů, velikosti) | Knihovna | „Moje střihy" | vidět (mobil: sbalené, je-li plán neprázdný) |
| Přidat střih do plánu | „+ Přidat" | „Do plánu" | vidět |
| Smazat střih z knihovny | „×" | „⋯" → „Smazat střih…" s dotazem | o klepnutí dál |
| Změnit střih v řádku | výběr „Střih" | beze změny | vidět |
| Odebrat řádek z plánu | „×" | „Odebrat" | vidět |
| Přidat další řádek | „+ Přidat další střih" (přidá demo) | „+ Přidat další střih" posune na „Moje střihy" | vidět |
| Velikost | řádek | beze změny | vidět |
| Množství | řádek, „Množství ×" | „Kolikrát" | vidět |
| Přidat přídavek na švy (pro střih) | řádek | beze změny, navíc ukazuje hodnotu | vidět |
| Varování „přídavek není jednoznačný" | řádek | beze změny | vidět |
| Obnovit přídavky podle střihu | „Díly a otáčení" | pod zaškrtávátkem přídavku | vidět po změně |
| Výběr varianty včetně „vynechat" | „Díly a otáčení" | pod velikostí | vidět |
| Zapnout a vypnout volitelný díl | „Díly a otáčení" | „Díly (N z M)" | sbalené |
| Poznámka u dílu, poznámky ke střihu | „Díly a otáčení" | „Díly (N z M)" | sbalené |
| Otáčení jednotlivého dílu | „Díly a otáčení" | „Díly" → „Otáčení jednotlivých dílů" | sbalené dvakrát |
| Látka: Role / Kus | přepínač | „Teprve koupím" / „Už mám kus" | vidět |
| Šířka, délka látky | pole | pole a předvolby šíře | vidět |
| Složená napůl a vysvětlení | zaškrtávátko | beze změny, nový text | vidět |
| Zachovat směr | zaškrtávátko | beze změny, nový text | vidět |
| „N umístění" | karta látky | věta v kartě výsledku | vidět po výpočtu |
| Výše přídavku na švy | Nastavení | „Upřesnit · Přídavky a mezery", hodnota vidět v řádku střihu | sbalené, hodnota vidět |
| Mezera mezi díly a „Výchozí" | Nastavení | „Upřesnit · Přídavky a mezery" | sbalené, změna vidět v záhlaví |
| Výchozí otáčení | Nastavení | „Upřesnit · Otáčení dílů" | sbalené |
| Páry zrcadlově | Nastavení | „Upřesnit · Otáčení dílů" | sbalené |
| Krok rastru, čas, semínko | „Přesnost a délka hledání" | „Upřesnit · Hledání" | sbalené |
| Spustit, zastavit, uplynulý čas | tlačítko | beze změny; do 850 px pevná lišta dole | vidět vždy |
| Stav výpočtu, varování o zastaralém výsledku, „čeká na výpočet" | výsledek | beze změny | vidět |
| Poznámky ke stříhání | výsledek | beze změny | vidět |
| Délka ke koupi | jen tisk | rámeček „Kolik látky koupit" a tisk (stejný pomocník) | vidět |
| Odznak „N / M umístěno" | karta | věta „všech N dílů" / „N z M dílů, K se nevešlo" | vidět |
| Rozměr, spotřebovaná délka, „N průchodů" | karta | „Podrobnosti" v kartě | sbalené |
| Využití | karta | řádek pod nákresem | vidět |
| Nákres, pravítka, kóty pod ukazatelem, legenda | karta | beze změny | vidět |
| Seznam „Nevešlo se" | karta | beze změny, navíc ve větě nahoře | vidět |
| Export PNG | karta | „Uložit obrázek" | vidět |
| Export SVG | karta | „Další formáty" → „Vektorový obrázek (SVG)" | sbalené |
| Tisk | každá karta | jedno tlačítko v rámečku „Kolik látky koupit" | vidět |
| Vzhled (světlý, tmavý) | hlavička | patička | vidět |
| Varování úložiště, zavření oznámení | horní pruh | beze změny | vidět |
| Ukázkový střih | předvyplněný řádek | beze změny (viz O2) | vidět |

Formát uloženého pracovního stavu (`src/storage.ts`) se nemění. Rozbalení bloků se neukládá.

### 3.6 Otevřené otázky pro vlastníka

| # | Otázka | Doporučení |
|---|---|---|
| O1 | Spojit Knihovnu a „Co šiju" do jednoho panelu, nebo nechat dva (jak počítá tiket 13)? | Spojit. Záložní varianta: dva panely, Knihovna přejmenovaná na „Moje střihy" a umístěná pod „Co šiju". |
| O2 | Smí nový střih z PDF nahradit nedotčený ukázkový řádek v plánu? | Ano, jen pokud je to jediný řádek a uživatelka ho neměnila. |
| O3 | Zaokrouhlení délky ke koupi: na 5 cm (tiket 13), nebo na 10 cm? Tisk dnes zaokrouhluje na 1 cm (`Layout.tsx:180`). | Neověřeno, po kolika centimetrech obchody prodávají. Rozhodnout jednou hodnotou v pomocníku, stejnou pro obrazovku i tisk. |
| O4 | Předvolby šíře 110 / 140 / 150 cm: odkud jsou? | Glosář je nedokládá. Ověřit u odbornice nebo nabídkou obchodů; do té doby nasadit jen s těmito třemi a hodnotami v jedné konstantě. |
| O5 | „Kolikrát" místo „Množství" a „Číslo pokusu" místo „Náhodné semínko". | Lidové popisky, v glosáři nejsou. Schválit, nebo navrhnout jiné. |
| O6 | Věta o rezervě („bez rezervy na sražení látky a navazování vzoru"). | Věcně správné upozornění, ale formulaci jsem neověřil ve zdrojích. Burda jen uvádí, že spotřeba závisí na šíři a vzoru látky (glosář, řádek „spotřeba"). |

---

## 4. České texty

Sloupec „Zdroj" odkazuje na glosář; „lidově" znamená srozumitelný popisek bez odborného zdroje.

### 4.1 Nadpisy, tlačítka, popisky

| Místo | Dnes | Nově | Zdroj |
|---|---|---|---|
| Úvodní věta | čtyři texty | „Rozmístěte díly střihu na látku a zjistěte, kolik jí koupit." | polohový plán = rozložení dílů na látku |
| Krok 1 | „Knihovna střihů" + „01 Co šiju" | „1 · Co šiju" | tiket 23 |
| Podnadpis | „Knihovna střihů" | „Moje střihy" | střih |
| Hlavní tlačítko kroku 1 | „Importovat PDF…" | „Přidat střih z PDF" | elektronický střih, PDF |
| Přidání do plánu | „+ Přidat" | „Do plánu" (popisek pro čtečky: „Přidat {název} do seznamu Co šiju") | – |
| Nabídka u střihu | „×" | „⋯" → „Smazat střih…" | – |
| Popis ukázky | „Syntetické demo" | „Ukázkový střih na vyzkoušení" | – |
| Sbalený blok | zóna + dva odkazy | „Záloha a soubory" | – |
| V bloku | „Zálohovat vše do souboru" | „Zálohovat vše do souboru" (beze změny) | – |
| V bloku | „Obnovit ze zálohy", „Importovat střihy" | „Nahrát soubor střihu nebo zálohy (.json)" | – |
| Nápověda v bloku | „Přetáhněte soubory .json (i zálohu) nebo je vyberte." | „Střihy jsou uložené jen v tomto prohlížeči. Zálohu si uložte do souboru, ať o ně nepřijdete. Soubor můžete také přetáhnout na seznam střihů." | – |
| Prázdný plán | „Vyberte střih v knihovně tlačítkem „+ Přidat"." | „Vyberte střih níže tlačítkem „Do plánu", nebo přidejte vlastní z PDF." | – |
| Řádek | „Množství" | „Kolikrát" (nápověda: „Kolikrát tento střih ušijete.") | lidově, O5 |
| Řádek | „Přidat přídavek na švy" | „Přidat přídavek na švy · {1} cm · změnit" | přídavek na švy |
| Řádek | „Obnovit přídavky na švy podle střihu" | beze změny | přídavek na švy |
| Řádek | skupina varianty (název ze střihu) + „— vynechat —" | beze změny, jen přesun pod velikost | varianta |
| Řádek | „Díly a otáčení · N vybráno" | „Díly ({N} z {M})" | díl |
| V dílech | „volitelné" | „volitelný díl" | volitelný díl |
| V dílech | výběry otáčení | „Otáčení jednotlivých dílů" (sbalené; „změněno u {N}") | – |
| V dílech | „Otáčení o 90° mění směr vlákna. Na přehybu se díl pouze obrací podél přehybu." | beze změny, přesun do „Otáčení jednotlivých dílů" | směr vlákna, přehyb |
| Řádek | „×" | „Odebrat" | – |
| Krok 1 | „+ Přidat další střih" | beze změny | – |
| Krok 2 | „02 Látky · v centimetrech" | „2 · Látka" (jednotka je u polí) | – |
| Přepínač | „Role · spočítat délku" | „Teprve koupím" (pod tím: „spočítáme, kolik") | lidově |
| Přepínač | „Kus · pevná délka" | „Už mám kus" (pod tím: „zadám jeho délku") | lidově |
| Pole | „Šířka · {materiál}" | „Šíře látky" (pro čtečky doplnit materiál) | šíře látky |
| Pole | „Délka · {materiál}" | „Délka kusu" | – |
| Předvolby | – | „110", „140", „150" (popisek pro čtečky: „Šíře 140 cm") | O4 |
| Zaškrtávátko | „Složená napůl" | „Složená napůl, lícem dovnitř" | BURDA |
| Nápověda | „Využitelná šířka 70 cm, přehyb vlevo. Díl mimo přehyb se stříhá ve dvou vrstvách." | „Stříháte dvě vrstvy najednou. Na nákresu je polovina šíře ({70} cm), přehyb je vlevo." | přehyb |
| Zaškrtávátko | „Zachovat směr (vlas, jednosměrný vzor)" | „Látka má vlas nebo směr vzoru" | směr vlasu, směr vzoru |
| Nápověda | „Díly se neotáčejí ani nepřeklápějí. Přebíjí výchozí otáčení i otáčení dílů; zrcadlové páry zůstávají." | „Například samet, manšestr nebo potisk, který má nahoře a dole. Všechny díly budou položené stejným směrem." | BURDA |
| Krok 3 | „03 Nastavení" | „3 · Polohový plán" | polohový plán |
| Blok | – | „Upřesnit · výchozí nastavení" / „Upřesnit · změněno: {seznam}" | – |
| Odkaz | – | „Vrátit výchozí" | – |
| Podnadpis | – | „Přídavky a mezery" | – |
| Pole | „Přídavek na švy" | „Přídavek na švy" (nápověda: „Přidá se jen u střihů, kde je to zaškrtnuté. Platí pro všechny střihy.") | přídavek na švy |
| Pole | „Mezera mezi díly" | beze změny, nápověda beze změny | glosář: správně |
| Podnadpis | – | „Otáčení dílů" | – |
| Výběr | „Výchozí otáčení" | „Jak smí být díly otočené" | – |
| Volba | „Bez otáčení" | „Neotáčet" | – |
| Volba | „0° / 180° · po niti" | „Po niti, i vzhůru nohama (0° a 180°)" | po niti |
| Volba | „0° / 90° / 180° / 270°" | „I napříč (po 90°), mění směr vlákna" | směr vlákna |
| Volba u dílu | „Dle nastavení" | „Jako ostatní díly" | – |
| Zaškrtávátko | „Páry zrcadlově" | „Pravý a levý díl stříhat zrcadlově" | BURDA |
| Nápověda | „Každý druhý stejný díl zrcadlově. Platí pro nesloženou látku." | „Z dílu, který se stříhá dvakrát, bude jeden zrcadlově. Platí pro nesloženou látku." | zrcadlově, pár |
| Podnadpis | „Přesnost a délka hledání" | „Hledání" | – |
| Výběr | „Krok rastru" · jemný / běžný / rychlý | „Přesnost" · „Jemná (pomalejší)" / „Běžná" / „Hrubá (rychlejší)" | lidově |
| Pole | „Čas na materiál" | „Jak dlouho hledat" (přípona „s na každou látku") | – |
| Pole | „Náhodné semínko" | „Číslo pokusu" (nápověda: „Jiné číslo zkusí jiné rozmístění. Stejné číslo dá stejný výsledek.") | lidově, O5 |
| Nápověda | „Jemnější rastr hledá těsnější polohový plán. Výsledek je přibližný; absolutní minimum nelze zaručit." | „Jemnější přesnost a delší hledání mohou ušetřit pár centimetrů. Výsledek je dobrý odhad, ne zaručené minimum." | – |
| Hlavní tlačítko | „Vytvořit polohový plán ↗" | beze změny | polohový plán |
| Při výpočtu | „■ Zastavit 3.2 s" | „■ Zastavit · 3,2 s" (česká desetinná čárka) | – |
| Výsledek | „Počet materiálů: N" | odstranit | – |
| Rámeček | – | „Kolik látky koupit" | spotřeba látky |
| Karta | „12 / 12 umístěno" | „všech 12 dílů" / „10 z 12 dílů, 2 se nevešly" | díl |
| Karta | „Využití" | beze změny | glosář: v pořádku |
| Karta | Rozměr, Spotřebovaná délka, průchodů | „Podrobnosti": „Rozměr plánu", „Spotřebovaná délka", „Počet pokusů hledání" | spotřeba |
| Karta | „Export PNG" | „Uložit obrázek" | – |
| Karta | „Export SVG" | „Další formáty" → „Vektorový obrázek (SVG)" | – |
| Rámeček | „Vytisknout plán" (v každé kartě) | „Vytisknout plán" (jednou) | – |
| Prázdný stav | „Přidejte střihy do seznamu Co šiju, zadejte látku a nechte fitter hledat úsporný polohový plán. / Demo střih je připravený k vyzkoušení." | „Vyberte střih, zadejte látku a stiskněte „Vytvořit polohový plán". / Ukázkový střih je připravený k vyzkoušení." | – |
| Patička | tři věty | „Střihy zůstávají v tomto prohlížeči. Nikam je neposíláme." + „Vzhled" | – |

### 4.2 Věty „Kolik látky koupit" (pomocník `fabricSummary`)

| Situace | Text |
|---|---|
| Teprve koupím, vše umístěno | „{Materiál}: kupte alespoň {1,45} m při šíři {140} cm." Malým písmem: „Přesně vychází {141,3} cm." |
| Teprve koupím, složená látka | „{Materiál}: kupte alespoň {1,45} m při šíři {140} cm. Počítáno pro látku složenou napůl." |
| Teprve koupím, něco se nevešlo na šířku | „{Materiál}: {2} díly jsou širší než látka. Zkuste širší látku nebo látku nesloženou." |
| Mám kus, vše se vešlo | „{Materiál}: vejde se. Z kusu {200} cm zbyde asi {58} cm." |
| Mám kus, něco se nevešlo | „{Materiál}: nevejde se. {3} díly zůstaly mimo, potřebujete delší kus." |
| Výpočet ještě běží | „{Materiál}: počítám…" |
| Pod rámečkem, vždy | „Délky jsou bez rezervy na sražení látky a navazování vzoru." (O6) |

Skloňování počtu dílů: 1 díl, 2–4 díly, 5 a více dílů.

### 4.3 Smazání střihu (přímo v řádku seznamu)

- Dotaz, střih není v plánu: „Smazat střih „{název}"? Nejde to vrátit."
- Dotaz, střih je v plánu: „Smazat střih „{název}"? Zmizí i ze seznamu Co šiju ({2} řádky). Nejde to vrátit."
- Tlačítka: „Smazat střih" a „Ponechat". Výchozí zaměření je na „Ponechat".
- Po smazání: „Střih „{název}" je smazaný."
- Nezdar: „Střih se nepodařilo smazat. Zkuste to znovu."

### 4.4 Chybové a stavové hlášky

| Dnes | Kde | Nově |
|---|---|---|
| „Prohlížeč nemohl spustit výpočetní worker." | `App.tsx:154` | „Výpočet se nepodařilo spustit. Načtěte stránku znovu, případně zkuste jiný prohlížeč." |
| „Výpočet se přerušil. Zkuste méně střihů najednou nebo větší krok rastru." | `App.tsx:149` | „Výpočet se přerušil. Zkuste méně střihů najednou, nebo v Upřesnit zvolte přesnost „Hrubá"." |
| „ID vestavěného demo střihu je vyhrazené." | `App.tsx:77`, `108` | „Tento soubor má stejné označení jako ukázkový střih, proto ho nejde nahrát." |
| „Importováno střihů: N. Stejná ID nahrazují předchozí verzi." | `App.tsx:84` | „Přidáno střihů: {N}. Střih, který už v seznamu byl, je nahrazený novou verzí." |
| „Střih „X" je uložený v knihovně. Stejné ID nahrazuje předchozí verzi. Tip: zálohujte si střihy do souboru." | `App.tsx:109` | „Střih „{X}" je uložený a přidaný do seznamu Co šiju. Tip: zálohujte si střihy do souboru." |
| „{soubor}: Neplatný soubor JSON." | `App.tsx:82` | „{soubor}: tohle není soubor střihu ani záloha z fitteru." |
| „Soubor je větší než 25 MB." | `App.tsx:73` | beze změny |
| „{soubor}: ukládání není dostupné, střih zůstane jen do zavření stránky." | `App.tsx:79`, `111` | „{soubor}: prohlížeč nedovolil střih uložit. Zůstane jen do zavření stránky." |
| „Knihovnu nelze načíst z úložiště. Importované střihy budou k dispozici jen do zavření stránky." | `App.tsx:38` | „Uložené střihy se nepodařilo načíst. Nově přidané střihy zůstanou jen do zavření stránky." |
| „Prohlížeč neumožňuje uložit seznam Co šiju a nastavení. Po zavření stránky se nezachovají." | `App.tsx:175` | beze změny |
| „Přidejte do seznamu Co šiju alespoň jeden vybraný díl." | `App.tsx:125` | „V seznamu Co šiju není žádný díl. Přidejte střih, nebo zaškrtněte díly." |
| „V seznamu Co šiju chybí střih. Importujte jej znovu, nebo odeberte jeho řádek." | `App.tsx:127` | „Jeden střih ze seznamu Co šiju už není uložený. Přidejte ho znovu, nebo jeho řádek odeberte." |
| „Chybějící střih — importujte znovu" | `OrderEditor.tsx:17` | „Střih chybí, přidejte ho znovu" |
| „Krok rastru musí být 0,25–1 cm." | `prepare.ts:57` | „Přesnost musí být 0,25–1 cm." |
| „Náhodné semínko musí být číslo." | `prepare.ts:59` | „Číslo pokusu musí být číslo." |
| „Množství v zakázce musí být celé číslo 1–100." | `prepare.ts:88` | „Kolikrát: zadejte celé číslo 1–100." |
| „Seznam Co šiju nebo nastavení se změnily. Zobrazené výsledky patří k předchozímu výpočtu; spusťte nový." | `App.tsx:242` | „Něco jste změnila. Tento plán už neplatí, vytvořte nový." s tlačítkem „Vytvořit znovu". Pozor: ženský rod; neutrální varianta „Zadání se změnilo." (glosář, poznámka 4, doporučuje neutrální tvar) |
| „Tento materiál zatím nebyl spočítán." | `App.tsx:247` | „Tato látka se zatím nespočítala." |
| „Připravuji první polohový plán…" / „Hledám úspornější polohový plán · {materiál}" / „Polohový plán je připravený." / „Zastaveno. Nejlepší dosud nalezený polohový plán zůstává zobrazený." | `App.tsx:132`, `140`, `144`, `161` | beze změny |

Doporučuji neutrální variantu „Zadání se změnilo. Tento plán už neplatí, vytvořte nový."

---

## 5. Změny tiketu 13 a kroky implementace

### 5.1 Co v tiketu 13 změnit

**Opravit zastaralé údaje**

1. Odkazy na řádky už neplatí: `removePattern` je `App.tsx:115-122` (ne 87-94), „průchodů" `Layout.tsx:176` (ne 163), prázdný stav `Layout.tsx:196-207`, nastavení `App.tsx:213-228`.
2. Tikety 14 (tisk), 19 (záloha) a 22 (výchozí mezera) jsou hotové (commit `b19c9be`). Věta „this ticket only places its entry point" pro zálohu neplatí: vstupní bod existuje (`Library.tsx:23-24`) a tiket ho jen přesouvá.
3. Tiket mluví o „per-pattern JSON download". Na hlavní obrazovce žádné takové tlačítko není; stažení jednoho střihu existuje jen v kroku 4 průvodce (`PdfImport.tsx:613`). Buď bod vypustit, nebo výslovně zadat jako novou funkci (nedoporučuji, zálohu pokrývá „Zálohovat vše").

**Doplnit, co tiket nepokrývá**

4. Délka ke koupi dnes existuje jen v tisku (`Layout.tsx:178-180`). Tiket má zadat jeden pomocník pro obrazovku i tisk, jinak budou dvě různá čísla (tisk zaokrouhluje na 1 cm, tiket na 5 cm).
5. Varianty vytáhnout ze sbaleného bloku (K4). Tiket naopak celý blok „Díly a otáčení" jen dál zanořuje.
6. Přídavek na švy na třech místech (V3).
7. Tři cesty přidání a chyba „+ Přidat další střih" přidává ukázkový střih (V1).
8. Mobil a tablet: pevná lišta s hlavním tlačítkem, konec dvousloupcového cikcaku (V6, S5).
9. Zprávy u místa akce (V5), přepis chybových hlášek (V9).
10. Velikost písma a dotykových ploch (V7): nejmenší text 12 px, ovládací prvky nejméně 44 px vysoké na dotykových zařízeních.
11. Výstupní tlačítka a jedno tlačítko tisku (S2).

**Zpochybnit**

12. **Tři různé bloky „Pokročilé"** („Pokročilé", „Pokročilé nastavení", „Otáčení dílů (pokročilé)"). Slovo říká „tohle není pro vás", ale záloha střihů pro každého je. Navrhuji názvy podle obsahu: „Záloha a soubory", „Upřesnit", „Otáčení jednotlivých dílů".
13. **Přídavek na švy a mezera mají zůstat viditelné.** Mezera má pevný výchozí stav a nápovědu „nechte 0,5 cm", patří do „Upřesnit". U přídavku stačí ukázat hodnotu u střihu s odkazem „změnit".
14. **Schované hodnoty bez signálu.** Tiket neřeší, že sbalený blok skryje změněnou hodnotu. Doplnit záhlaví „změněno: …" a „Vrátit výchozí".
15. **Test „řetězce Krok rastru a Náhodné semínko jsou jen v pokročilé komponentě".** Je křehký (testuje texty, které tiket 15 přesune do slovníku, a tento návrh je navíc přejmenovává) a neověřuje chování. Nahradit testy čistých pomocníků (viz kroky níže). Projekt nemá testy vykreslení komponent a tento tiket je nemá zavádět.
16. **Zaokrouhlení na 5 cm a předvolby 110 / 140 / 150** nejsou ničím doložené (O3, O4). Ponechat jako konstanty s testem, hodnoty potvrdit.
17. **Rozsah a velikost.** S doplněními je to L, ne M. Rozdělit na kroky níže; každý jde nasadit a ověřit zvlášť (vlastník zkouší každou změnu na GitHub Pages).
18. **Dva panely místo jednoho** (O1). Tiket nechává Knihovnu jako samostatný panel nad krokem 1.

### 5.2 Kroky implementace

Předpoklad: tiket 23 je dokončený a sloučený. Celek mění více než pět souborů, takže před začátkem potřebuje schválený plán. Každý krok končí zeleným `npm run typecheck && npm run lint && npm test` a ručním ověřením na GitHub Pages. Pořadí je podle přínosu a rizika; kroky 1–3 jsou na sobě nezávislé.

**Krok 1 · Kolik látky koupit** (řeší K1, S1 zčásti)

- Soubory: nový `src/model/summary.ts`, `src/ui/Layout.tsx`, `src/ui/App.tsx`, `src/styles.css`, `tests/summary.test.ts`.
- Obsah: `lengthToBuy(usedCm)` s jednou konstantou zaokrouhlení; `fabricSummary(material, fabric, result, pieceCount)` vrací větu a přesnou hodnotu; rámeček nad kartami; tisk (`Layout.tsx:179-180`) používá stejného pomocníka.
- Akceptační kritéria: po výpočtu je nad nákresy rámeček s jednou větou na materiál v pořadí materiálů; tisk ukazuje stejné číslo jako obrazovka; při zastaralém výsledku rámeček zůstává, ale platí varování.
- Testy: role, 141,3 cm, šíře 140 → věta obsahuje „1,45 m" a „140 cm"; délka přesně na násobku se nezvyšuje; složená látka → věta uvádí nesloženou šíři a „složenou napůl"; kus 200 cm, spotřeba 141,3 → „vejde se" a „58 cm"; nevešlé díly 1, 3, 5 → správné tvary „díl / díly / dílů"; `usedLength` 0 a žádné díly → žádná věta.
- Ručně: ukázkový střih, role 140 cm; přepnout na kus 50 cm; složit látku.

**Krok 2 · Bezpečné smazání** (K3)

- Soubory: `src/ui/Library.tsx`, `src/ui/App.tsx`, `src/styles.css`, `src/model/summary.ts` nebo `prepare.ts` (pomocník `linesUsing(order, patternId)`), test.
- Akceptační kritéria: klepnutí na smazání nic nesmaže, ukáže dotaz v řádku; „Ponechat" i Esc dotaz zavřou; dotaz uvádí počet dotčených řádků plánu; ukázkový střih smazat nejde (jako dnes); smazání není vedle „Do plánu".
- Testy: `linesUsing` pro 0, 1 a více řádků; text dotazu pro oba případy.
- Ručně: smazat střih, který je a který není v plánu; klávesnicí.

**Krok 3 · Moje střihy: PDF první, soubory sbalené** (K2, S3)

- Soubory: `src/ui/Library.tsx`, `src/styles.css`, `README.md` (Použití).
- Akceptační kritéria: „Přidat střih z PDF" je jediné hlavní tlačítko panelu; výběr souboru `.json`, záloha i obnovení fungují ze „Záloha a soubory"; přetažení `.json` nebo zálohy na panel funguje i se sbaleným blokem; dotaz na obnovení zálohy (`App.tsx:178-182`) beze změny.
- Testy: stávající `tests/storage.test.ts` zelené; nové čisté testy nejsou potřeba.
- Ručně: nahrát střih souborem, přetažením, obnovit zálohu oběma volbami.

**Krok 4 · Řádek střihu** (K4, V1, V3, S8)

- Soubory: `src/ui/OrderEditor.tsx`, `src/ui/App.tsx` (jen `App.tsx:193`), `src/styles.css`, případně `tests/prepare.test.ts`.
- Akceptační kritéria: výběry variant jsou vidět bez rozbalení a mají stejné chování včetně „vynechat"; „Díly (N z M)" ukazuje správné počty; otáčení dílů je ve vnořeném sbaleném bloku s počtem změn; u zaškrtávátka přídavku je vidět aktuální hodnota; „+ Přidat další střih" nepřidá ukázkový střih.
- Testy: stávající testy `variantChoice`, `chooseVariant`, `includedPieces` zelené; nový test pomocníka pro počty „N z M" (varianty se počítají jako jeden zvolený díl ze skupiny).
- Ručně: střih s variantami, změna velikosti při zvolené variantě, střih s nejednoznačným přídavkem.

**Krok 5 · Látka** (V8, S6)

- Soubory: `src/ui/App.tsx` (nebo vyčlenit `src/ui/FabricEditor.tsx`, protože `App.tsx` má přes 250 řádků a tento blok je samostatný), `src/model/prepare.ts` (konstanta předvoleb), `src/styles.css`.
- Akceptační kritéria: předvolba nastaví šíři a je označená, když se hodnota shoduje; pole zůstává ručně editovatelné; přepnutí „Teprve koupím" / „Už mám kus" se chová jako dnešní Role / Kus (výchozí délka 100 cm); nové texty podle 4.1; uložený stav se načte beze změny.
- Testy: konstanta předvoleb připnutá testem; stávající `checkInputs` testy zelené.
- Ručně: načíst stránku se starým uloženým stavem, projít obě zaškrtávátka.

**Krok 6 · Upřesnit** (V4, S7)

- Soubory: `src/ui/App.tsx` (nebo nový `src/ui/Refine.tsx`), `src/model/prepare.ts` (pomocník `changedSettings(settings)`), `src/ui/fields.tsx` (texty voleb otáčení), `src/styles.css`, test.
- Akceptační kritéria: panel „Nastavení" zmizel; všech sedm voleb je v „Upřesnit" a funguje jako dnes; záhlaví říká „výchozí nastavení", nebo vyjmenuje změny; „Vrátit výchozí" vrátí vše kromě přepínačů přídavku u jednotlivých střihů (`addSeam`); odkaz „změnit" u přídavku blok otevře; chyba vstupu v poli uvnitř sbaleného bloku blok otevře.
- Testy: `changedSettings(defaultSettings)` je prázdné; změna mezery, času a čísla pokusu vrací odpovídající položky; `addSeam` se nepočítá.
- Ručně: změnit mezeru, sbalit, zkontrolovat záhlaví; zadat neplatnou hodnotu.

**Krok 7 · Karta výsledku a výstupy** (S1, S2)

- Soubory: `src/ui/Layout.tsx`, `src/ui/App.tsx`, `src/styles.css`.
- Akceptační kritéria: věta o počtu dílů nahrazuje odznak; „Podrobnosti" obsahují rozměr, spotřebovanou délku a počet pokusů; „Uložit obrázek" a „Vektorový obrázek (SVG)" dávají stejné soubory jako dnes; tisk je jedno tlačítko a tiskne všechny materiály; tisková verze se nezměnila kromě čísla z kroku 1.
- Testy: stávající `tests/layout.test.ts` a `tests/export.test.ts` zelené.
- Ručně: export obou formátů, tisk se dvěma materiály.

**Krok 8 · Rozvržení, mobil, čitelnost** (V2, V5, V6, V7, S4, S5)

- Soubory: `src/ui/App.tsx`, `src/ui/Library.tsx`, `src/styles.css`, `index.html` (jen pokud se mění popis stránky).
- Akceptační kritéria: tři číslované kroky v pořadí Co šiju, Látka, Polohový plán; „Moje střihy" uvnitř kroku 1 (podle O1); do 850 px jeden sloupec a pevná lišta s tlačítkem, která nepřekrývá poslední pole; „Vzhled" v patičce a funguje; žádný text pod 12 px; ovládací prvky nejméně 44 px vysoké při `pointer: coarse`; chyba spuštění je vidět bez posunu stránky; tisk beze změny.
- Testy: stávající `tests/theme.test.ts` zelené; CSS se ověřuje ručně.
- Ručně: šířky 360, 600, 820, 1100 a 1500 px; světlý a tmavý vzhled; tisk.

**Krok 9 · Hlášky, ukázkový střih, README** (V9, S9)

- Soubory: `src/ui/App.tsx`, `src/model/prepare.ts`, `tests/prepare.test.ts` (hlášky připnuté testy), `README.md`.
- Akceptační kritéria: texty podle 4.4; po uložení střihu z PDF se nový střih dostane do plánu podle O2 a zpráva to říká; README „Použití" odpovídá nové obrazovce.
- Testy: upravit očekávané texty v `tests/prepare.test.ts`; test pomocníka `shouldReplaceDemo(order, demoId)` (jediný nedotčený řádek ukázky → ano; změněný řádek nebo více řádků → ne).
- Ručně: import PDF na čistém prohlížeči a s rozpracovaným plánem.

Pořadí vůči tiketu 15 (slovník textů): všech devět kroků před ním, jinak se texty budou přepisovat dvakrát.

### 5.3 Rizika

- **Uložený stav.** Žádný krok nemění tvar `Workspace`; test načtení starého stavu už existuje v `tests/storage.test.ts` a musí zůstat zelený.
- **`<fieldset disabled>` při výpočtu** (`App.tsx:185`) vypíná i „Moje střihy". Po spojení panelů to zůstává; pevná lišta s tlačítkem „Zastavit" musí být mimo fieldset (jako dnes `run-actions`).
- **Sbalené bloky a validace.** Prohlížeč neumí zaměřit neplatné pole uvnitř zavřeného `<details>`; proto kritérium v kroku 6.
- **Souběh s tiketem 23.** Tento dokument cituje texty z pracovního stromu během přejmenování. Před implementací porovnat sloupec „Dnes" s aktuálním kódem.
