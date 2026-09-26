# fitter

Statická aplikace pro rozložení nepravidelných střihových dílů na látku. Běží v prohlížeči, bez účtu, backendu, analytiky a odesílání dat. Rozhraní je česky. Vestavěná **Geometrická taška** obsahuje vlastní syntetické tvary; slouží k vyzkoušení, ne k šití.

## Použití

1. V **Knihovně střihů** importujte jeden nebo více souborů `.json` ve formátu `fitter-pattern@1`. Funguje výběr souborů i přetažení. Stejné ID aktualizuje uložený střih. Demo funguje i bez importu.
2. Přidejte řádky do **Zakázky**. Zvolte střih, velikost a množství. V rozbalovacích nastaveních vybírejte díly, varianty a jejich otáčení. Volitelné díly jsou standardně vypnuté.
3. Pro každý materiál nastavte **Látku**: roli se známou šířkou, nebo kus se šířkou a délkou. Šířku vždy zadávejte **před složením**. Při složení napůl je využitelná šířka poloviční a lom je vlevo.
4. Zkontrolujte švové záložky, mezeru mezi díly a otáčení. Standardně se přidává 1 cm k dílům označeným bez záložky. U nejasných údajů se záložka automaticky nepřidává a zobrazí se upozornění. Změna přepínače platí pro celý střih; volba „Obnovit záložky podle střihu“ vrátí výchozí chování jednotlivých dílů.
5. Stiskněte **Spočítat rozložení**. Výsledky se průběžně zlepšují. **Zastavit** okamžitě ukončí worker a ponechá dosud nalezené výsledky; další materiály mohou zůstat nespočítané.
6. Každý materiál má nákres s pravítky po 10 cm, využití, spotřebovanou délku, seznam „Nevešlo se“ a export **SVG** / **PNG**. SVG používá centimetry a obsahuje popisky i směry vláken; PNG má bílý podklad. U dlouhých rolí se rozlišení PNG automaticky sníží (nejvýše 8 192 px na straně / 16 milionů pixelů).

Šipky ukazují směr vlákna, ↔ zrcadlení. Otáčení 0°/180° zachovává směr osnovy, ale mění orientaci jednosměrného vzoru či vlasu; otáčení o 90° mění i směr osnovy. Před stříháním zkontrolujte vlastnosti své látky.

Na nesložené látce se díly na lomu rozvinou zrcadlením a sjednocením obrysu. Volba „Páry zrcadlově“ zrcadlí u každého kusu oblečení každou druhou kopii dílu (např. levý a pravý rukáv). Na složené látce zůstávají díly na lomu polovinami s hranou přesně na lomu. Ostatní umístění dávají zrcadlový pár; u lichého počtu kopií aplikace upozorní na zrcadlové kusy navíc. Není-li lom svislý s tolerancí 1°, díl se rozvine a na složené látce se řeže ve dvou vrstvách jako běžný díl. Záložka u polovičního dílu nepřesahuje přes lom.

## Soukromí a ukládání

Importované střihy zůstávají v **IndexedDB tohoto prohlížeče a této adresy webu**. Zakázka, látky a nastavení se ukládají do `localStorage`. Aplikace nemá síťové služby ani externí fonty. Při nedostupném úložišti zobrazí upozornění a funguje v paměti. Vymazání dat prohlížeče odstraní i knihovnu; originální JSON soubory si ponechte jako zálohu. Změna prohlížeče nebo adresy webu knihovnu nepřenáší.

Soukromé podklady patří do ignorované složky `library/`. Nejsou importované do zdrojového kódu, testů, dokumentace ani buildu a na GitHub Pages se neposílají. Testovací data jsou pouze syntetická. Převod PDF střihů na knihovní JSON řeší samostatný nástroj v [tools/pattern-extract](tools/pattern-extract/).

## Vývoj

Node.js 22.12+ a závislosti podle `package-lock.json`.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Vite + TypeScript ve strict režimu + Preact. Geometrie používá Clipper2, knihovna `idb-keyval` zajišťuje IndexedDB. `src/model` validuje soubory a připravuje díly; `src/geom` pracuje s obrysy v centimetrech; `src/nest` obsahuje čisté výpočetní jádro a worker; `src/ui` rozhraní a exporty.

Použitá verze `clipper2-js` 1.2.4 má v uzavřeném offsetu chybu předávání indexu předchozího vrcholu. Malý adaptér v `src/geom/offset.ts` opravuje tuto smyčku pouze na vlastní instanci; spoje a sjednocení nadále provádí knihovna. Závislosti se nemění. Regresní testy ověřují rozměr offsetu i skutečné odstupy polygonů.

## Výpočet a jeho meze

Konzervativní rasterizace na kroku 0,25–1 cm pokrývá všechny buňky dotčené vnitřkem obrysu, zvětšeného o polovinu mezery. Obsazené buňky se ukládají do řádkových intervalů. Greedy průchod hledá od horního levého rohu; další průchody mění pořadí a orientace pomocí generátoru s nastavitelným semínkem. Hodnotí počet neumístěných dílů, jejich plochu a spotřebovanou délku. Výpočet standardně hledá 5 sekund **na materiál**, s průběžnými výsledky. Čas se kontroluje mezi průchody, proto může poslední průchod limit mírně přesáhnout. Stejné semínko určuje stejnou posloupnost kandidátů; rychlost počítače určuje počet průchodů.

Jde o heuristiku, která nezaručuje globální minimum. Konzervativní rastr může ponechat větší mezeru nebo ohlásit díl jako neumístěný, i když by přesnější výpočet našel místo. Hrany látky nemají povinný odstup. Využití = plocha umístěných řezných obrysů / (využitelná šířka × délka kusu nebo spotřebovaná délka role). Na složené látce se obě plochy vztahují k jedné vrstvě, takže podíl zůstává správný.

Podporován je jeden jednoduchý vnější obrys na díl, bez otvorů. Import odmítne křížící se nebo degenerované obrysy. Případné dutiny vzniklé sjednocením nebo offsetem se konzervativně vyplní. Souřadnice jsou v cm, osa y směřuje dolů a vstupní směr vlákna má být +y. Údaje `area` a `bbox` se validují jako metadata; výpočet je znovu odvozuje ze skutečného obrysu.

Označení lomu z extrakce může mít drobnou odchylku od obrysu. Import toleruje nejvýše 0,2 cm; při přípravě se taková hrana srovná s vyznačeným lomem a aplikace výslovně zobrazí poznámku. Přesný vstupní obrys se tímto krokem nemění. Větší nesoulad nebo oddělené obrysy se odmítnou.

Pro omezení paměti a náhodných překlepů je limit 500 umístění na zakázku, 100 kusů na řádek, šířka do 1 000 cm, délka pevného kusu do 10 000 cm, importní soubor do 25 MB a nejvýše 10 000 bodů obrysu. Limit hledání lze nastavit do 60 sekund na materiál.

## GitHub Pages

Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) při pushi do `main` nebo ručním spuštění ověří projekt, sestaví `dist/` a nasadí pouze tuto složku. V nastavení repozitáře zvolte **Pages → Source → GitHub Actions**. Relativní `base: './'` podporuje adresu typu `https://uzivatel.github.io/fitter/` včetně workeru. Pokud má repozitář jinou výchozí větev, upravte filtr workflow. Žádné střihy se při nasazení nenačítají ze složky `library/`.

## Import PDF

V **Knihovně střihů → Importovat PDF…** vyberte dlaždicové PDF. První krok **Stránky** načte vektorové cesty a text, hledá shodnou geometrii, ořezové rámy, návaznost hran a popisky dlaždic. Při porovnávání obsahu vynechává cesty opakované na stejném místě alespoň poloviny stránek (rámy, značky a další opakované prvky). Spoje ověřuje průsečíky a směry čar v překryvu, na ořezovém rámu nebo na hraně stránky. Zobrazí složený arch s čísly stránek; zelené spoje mají ověřený shodný obsah, šedé vyžadují kontrolu. Shodné cesty se v náhledu neopakují. PDF neopouští prohlížeč.

Rozložení lze opravit bloky: rozsah stránek a počty dlaždic v řádcích, např. stránky **1–22**, řádky **2,4,4,4,4,4**. Řádky se plní zleva po stránkách, více bloků leží vedle sebe s mezerou. Detekce přijme jen bloky odpovídající tomuto pořadí. Pokud najde vícestránkové bloky, ostatní stránky uvede jako **Nepoužité stránky**; lze je vrátit úpravou bloků. Krok v pt udává vzdálenost začátků sousedních dlaždic; menší krok znamená větší překryv. Automatická detekce je heuristická, náhled vždy zkontrolujte. Skeny bez vektorových cest zatím nejsou podporované. Po platném rozložení tlačítko **Další** otevře krok **Velikosti**. Legenda seskupuje čáry podle barvy, druhu kreslení (tah / výplň), šířky v pt a čárkování po transformaci PDF. Šířky zaokrouhluje na 0,05 pt, čárkování na 0,5 pt; u neuniformní transformace ukazuje průměr vážený délkou, rastr měří šířku každého úseku. Zadejte velikost (např. **42**, **M**, **uni**); prázdné pole styl vynechá, více stylů může patřit téže velikosti. **uni** se předvyplní jen u jednoznačně převládající délky uzavřených obrysů.

Měřítko hledá kontrolní čtverec na všech stránkách, včetně nepoužitých. Měří střed čáry a upřednostňuje blízké rozměry či kontrolní popisky; běžné rozměry 2,54 / 3 / 4 / 5 / 10 cm rozpozná s tolerancí 3 %. Zobrazí stránku a naměřenou stranu; skutečnou stranu v cm lze změnit. Bez vhodného čtverce výslovně použije **100 %**, tj. 2,54 / 72 cm na pt. Rozpoznaný čtverec a kopie se stejnou stranou (tolerance 0,5 pt) se při obkreslení vynechávají, i když mají popisky převedené na křivky. Jde o heuristiku: pokud chybí stejně velký čtvercový díl, vypněte **Vynechat kontrolní čtverce**.

Obkreslení běží ve Web Workeru, zvlášť pro každou velikost. Výchozí rastr je **0,5 mm**, zacelení mezer **1 mm**, minimální plocha **15 cm²**. Rastr lze změnit na 0,25–1 mm, mezery na 0–6 mm a plochu na nezáporné číslo. Čárkované tahy se pro obrys kreslí souvisle, tenké vyplněné pásy se rasterizují jako výplň. Vyplnění zevně rozliší vnitřek dílu; vnější volné čáry se do něj neprodlužují. Obrysy se zjednodušují s tolerancí 0,3 mm. Největší součet ploch určuje referenční velikost, ostatní obrysy se při překryvu alespoň poloviny menší plochy přiřazují k jejím dílům. Nepřiřazené obrysy zůstanou samostatnými kandidáty. Náhled ukazuje barevné velikosti a čísla kandidátů; tabulka plochy a rozměry vodorovného/svislého ohraničení v cm. **Zpět** vrací rozložení. Výsledek v paměti obsahuje měřítko, velikosti, kandidáty a textové popisky. PDF ani nastavení průvodce se neukládají; uloží se jen hotový střih.

Krok **Díly** ukazuje pro každého kandidáta náhled: referenční velikost vyplněná, další velikosti tenkými barevnými obrysy, rovné hrany alespoň 5 cm přerušovaně, lom červeně a směr vlákna modrou šipkou. Všechna pole jsou předvyplněná návrhy, které lze upravit:

- **Použít** je vypnuté u kandidátů bez popisku s plochou pod 25 cm² a u tabulek a legend (alespoň tři popisky, většina jen čísla nebo velikosti).
- **Název** je první vhodný popisek uvnitř dílu podle výšky písma. Vynechá pokyny ke stříhání, čísla a seznamy velikostí, rozměry a měřítko, slova lomu a vlákna, texty delší než 40 znaků nebo 5 slov a text na více než polovině dílů (název střihu). Jinak „Díl N“.
- **Počty** čte „vystřihnout 2x PODŠÍVKA“, „2x zuschneiden“, „1x im Bruch zuschneiden“, „cut 2“, „Cut 2 x“, „2 ×“, „x 2“ nebo „2 mal“. Materiál je slovo za počtem (před prvním počtem jen známý materiál, např. „PODŠÍVKA 2x“), malými písmeny a u známých českých slov v základním tvaru (PODŠÍVCE → podšívka, VNĚJŠÍ → vnější); cizí slova zůstávají, jak jsou vytištěná. Stejný materiál uvedený vícekrát (např. ve dvou jazycích) má větší z počtů; počty bez materiálu se berou jako jeden pokyn s větším počtem. Takový počet dostane (a) známý materiál jmenovaný v jiném popisku dílu, který nemá vlastní počet (např. „UCHO V PODŠÍVCE“ + „vystřihnout 2x“ → podšívka × 2); jinak (b), pokud nejčastější vytištěný materiál střihu už na dílu počet má, se nic neslučuje a karta upozorní „Pokyn … neuvádí materiál – zkontrolujte počty.“; jinak (c) nejčastější vytištěný materiál střihu, případně „hlavní“. Bez pokynu hlavní × 1. Řádky lze přidat a odebrat; úprava počtů upozornění skryje.
- **Lom** se zapne, když uvnitř dílu nebo do 2 cm od obrysu leží slovo lomu (Bruch, Stoffbruch, im St.Br., fold, lom, na lomu, přeložení, přehyb, pli). Zvolí se nejbližší rovná hrana: vrcholy obrysu do přibližně 2 mm od spojnice (schody rastru), delší úseky do 1°, délka alespoň 5 cm a celý díl na jedné straně. Jinou hranu vyberete kliknutím u přerušované hrany v náhledu nebo v seznamu. Pro každou velikost se lom přichytí k jejímu vlastnímu obrysu (vrcholy do 2,5 mm, proložení přímkou jako `snap_fold`); velikost bez shody se uloží bez lomu a karta na to upozorní.
- **Směr vlákna** hledá rovné čáry celé uvnitř referenčního obrysu, které neleží na střihové čáře žádné velikosti (1,5 mm) a nejsou opakovaným prvkem stránek. Části jedné přímky (dlaždice, čárkování) se spojí. Přednost má šipka (dvě křidélka zpět podél čáry na opačných stranách, 10–60°, nebo malá uzavřená hlava) nebo čára do 2 cm od textu Fadenlauf/grain/FL/vlákno/osnova/droit fil, pokud má alespoň 1,5 cm a 10 % dílu ve svém směru. Jinak nejdelší čára alespoň 3 cm a 25 % dílu, pak směr lomu, jinak svisle. Relativní délky brání záměně s písmem kresleným čarami (Celia). Tlačítka: **Podle čáry** (návrh), otočení o ±90° a úhel ve stupních (0° vodorovně, 90° svisle v náhledu).
- **Volitelný díl**, **Skupina variant** a **Varianta** odpovídají polím `optional`, `variantGroup` a `variant`.

Krok **Uložit** předvyplní název z titulu PDF (jinak z názvu souboru) bez koncových formátů papíru (A0–A4, US Letter, Letter, Legal) a slov „střih“, „Schnittmuster“, „pattern“, „ebook“, „print“, „copyshop“; název jen z těchto slov zůstane celý. Dále ID jako slug jedinečný vůči knihovně (stejné zadané ID nahradí uložený střih, ID dema je vyhrazené), nepovinného autora a **švovou záložku** podle textů archu: „Nahtzugabe enthalten“, „inkl. Nahtzugabe“, „přídavky na švy“, „seam allowance included“ → obsahuje; „ohne Nahtzugabe“, „kein(e) Nahtzugabe“, „bez přídavků na švy“, „Přidejte přídavky…“, „without seam allowance“ → bez záložek; obojí nebo nic → nejasné. Pořadí velikostí je přirozené (čísla číselně, pak XS < S < M < L < XL < XXL, pak text) a lze ho posouvat. Souhrn ukazuje díly × velikosti s rozměry. Díly se sestaví jako v `extract.py cmd_build`: všechny velikosti se otočí kolem těžiště referenčního obrysu o 90° − úhel vlákna (vlákno podél +y), převedou na cm, posunou na nulové minimum ohraničení a zaokrouhlí na 0,01 cm; obrys má stejnou orientaci jako výstup offline sestavovače (záporný součet křížových součinů). Výsledek musí projít `parsePatternFile`. **Uložit do knihovny** jej uloží stejně jako import JSON (IndexedDB), zavře průvodce a střih je hned v knihovně i nabídce zakázky; **Stáhnout .json** stáhne soubor `fitter-pattern@1`.

Meze: slova lomu, názvy a počty se čtou jen z textové vrstvy. PDF bez ní (Celia má písmo převedené na křivky) dostane „Díl N“, hlavní × 1, žádný lom a vlákno z čar, případně svisle; krok **Díly** na to upozorní a lom je třeba zapnout ručně. Dva díly nakreslené jedním obrysem (u Fiony) zůstanou jedním dílem s počty obou.

Testy PDF vytvářejí vlastní syntetické soubory. `tests/local/pdf-acceptance.test.ts` navíc při přítomnosti `patterns/` a `tools/pattern-extract/configs/` ověřuje automatické bloky a relativní posuny šesti místních PDF proti offline sestavovači, bez náhrady ručně zadanými bloky. Měří také detekci, umístění a deduplikaci (limit 3 s na PDF). Obsah střihů nevypisuje ani nezapisuje; v CI bez těchto adresářů se automaticky přeskočí.

Úplné rozložení se detekuje pro Alexia, Celia a Dandelion. U Fiona a Gyda se detekují samostatné vodorovné řady: svislé průsečíky patří pouze rohům rámu a obsah neurčuje vzájemnou polohu řad. U Raglan ALEX část sousedních dlaždic nemá odpovídající průsečíky ani na středu ořezového rámu (např. 33→34 při toleranci polohy 0,6 pt a směrnice 0,05); jiné kandidátní spoje si odporují. Test tyto tři případy výslovně eviduje jako částečnou detekci a ověřuje posuny nalezených bloků. Úplné rozložení těchto PDF zatím vyžaduje úpravu bloků; detektor neobsahuje pravidla pro konkrétní soubory.

`tests/local/pdf-trace.test.ts` při přítomnosti `patterns/`, `library/` a `tools/pattern-extract/configs/` ověřuje měřítko všech šesti PDF (odchylka pod 1 %). Pro Gyda, Fiona a Celia používá pouze automatické rozložení a přiřazuje styly filtry konfigurace. Po vynechání kontrolních čtverců musí počty obrysů souhlasit s počty odlišných obrysů knihovny; plochy do 2 % a rozměry minimálního natočeného obdélníku do 0,4 cm. Každá velikost Celia má limit 2 s. Raglan ALEX se pěticí barev výplně a mezerou 4 mm pouze hlásí počty a shody: při nynějším částečném rozložení nevznikají uzavřené díly. Raglan používá výchozí měřítko 100 % (nenalezen vektorový kontrolní čtverec); Alexia se měří po středu tahu, zatímco offline poznámka používá jeho vnější okraj. Test vypisuje jen číselné výsledky bez textů a souřadnic střihů. Bez lokálních adresářů se přeskočí.

`tests/local/pdf-pieces.test.ts` projde pro Gyda, Fiona a Celia celý řetězec bez ručních úprav (automatické rozložení, styly podle konfigurace, měřítko, obkreslení, `suggestPieces`, `buildPattern`, `parsePatternFile`) a porovná výsledek s `library/`. Každý odlišný obrys knihovny musí mít díl s plochou do 2 % a osově zarovnaným ohraničením do 0,5 cm v každé velikosti (kontrola otočení podle vlákna), stejnou přítomností lomu a délkou lomu do 1 cm; počet použitých dílů se rovná počtu odlišných obrysů. Počty podle materiálů musí souhlasit u všech dílů Gyda a u dílů `pd`, `zd-1` a `zd-2` Fiony (ID knihovny); `zd-2` se porovnává se součtem dílů knihovny nakreslených stejným obrysem. U PDF bez textové vrstvy test očekává „bez lomu“ a místo toho ověří, že jedna z nabízených rovných hran dá lom knihovny ve všech velikostech (do 1 cm). Vypisuje jen čísla a ID dílů.
