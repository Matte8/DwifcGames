# TARDIS vs Dalek

Due arcade in uno, ambientati nell'universo di Doctor Who, selezionabili dal menu principale:

- **Asteroidi** — piloti il TARDIS attraverso un campo di Dalek alla deriva, li schivi (o li distruggi con il cacciavite sonico) e cerchi di sopravvivere il più a lungo possibile.
- **Space Invaders** — difendi la Terra da una formazione di Dalek in avvicinamento: TARDIS che si muove solo in orizzontale, bunker distruttibili, ondate sempre più veloci.

Progetto amatoriale, **non ufficiale e senza scopo di lucro**, creato per gioco personale. Nessuna affiliazione con la BBC: nessun logo, font o audio originale della serie è stato utilizzato — grafica ed effetti sonori sono generati interamente via codice.

## Caratteristiche

- **Due modalità di gioco**, con record salvato separatamente per ciascuna.
- **100% offline**: nessuna dipendenza esterna (nessuna CDN, nessun font remoto, nessun asset audio/video). Basta aprire `index.html` o servirlo da un qualsiasi web server statico.
- **Installabile come PWA**: `manifest.json` + `service-worker` (`sw.js`) con strategia cache-first, per installarlo su schermata Home e giocare anche senza connessione.
- **PC e tablet**: controlli da tastiera (frecce/WASD + spazio) e un pad virtuale touch (trascinabile) per i dispositivi con schermo tattile, layout responsive con supporto orientamento e "safe area" per notch/home indicator.
- **Grafica pixel-art su Canvas 2D** e **audio sintetizzato** via Web Audio API (nessun file audio da scaricare).
- Record personale salvato in locale (`localStorage`), nessun account o server richiesto.

## Come si gioca

### Asteroidi

| Azione | Tastiera | Touch |
|---|---|---|
| Ruota + spinta | ⬅️ ➡️ / A D ruotano, ⬆️ / W spinge | pad virtuale: trascina nella direzione voluta |
| Cacciavite sonico (spara) | Spazio | pulsante ⚡ |
| Pausa | P oppure Esc | icona pausa in alto |

Distruggi i Dalek grandi per farli scindere in unità più piccole e veloci (più punti, ma più difficili da colpire). Ogni tanto rilasciano un potenziamento: cacciavite rapido, scudo temporaneo o vita extra. Ogni 10.000 punti si ottiene una vita bonus.

### Space Invaders

| Azione | Tastiera | Touch |
|---|---|---|
| Movimento orizzontale | ⬅️ ➡️ / A D | pad virtuale: trascina a destra/sinistra |
| Cacciavite sonico (spara) | Spazio | pulsante ⚡ |
| Pausa | P oppure Esc | icona pausa in alto |

La formazione di Dalek avanza e scende sempre più in fretta man mano che ne restano di meno; usa i quattro bunker come riparo (si erodono ai colpi, sia tuoi che nemici) e non lasciarli arrivare in fondo allo schermo.

Comune a entrambe: Muto — icona altoparlante in alto.

## Eseguirlo in locale

Non serve alcuna build. Basta un web server statico qualsiasi, ad esempio:

```bash
npx http-server -p 8080
# oppure
python3 -m http.server 8080
```

poi apri `http://localhost:8080`. È anche possibile aprire `index.html` direttamente da file system (il service worker in quel caso non si registra, ma il gioco funziona comunque interamente offline perché non fa alcuna chiamata di rete).

## Struttura del progetto

```
index.html          Markup, HUD, schermate, controlli touch
css/style.css        Stile e layout responsive
js/game.js           Motore di gioco (loop, entità, input, audio, stati)
manifest.json         Manifest PWA
sw.js                 Service worker (cache offline)
icons/                Icone PWA (generate con scripts/generate_icons.py)
scripts/generate_icons.py   Script di supporto (richiede Pillow) per rigenerare le icone
```
