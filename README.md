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
