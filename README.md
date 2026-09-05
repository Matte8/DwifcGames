# TARDIS vs Dalek

Arcade in stile *Asteroids* ambientato nell'universo di Doctor Who: piloti il TARDIS attraverso un campo di Dalek alla deriva, li schivi (o li distruggi con il cacciavite sonico) e cerchi di sopravvivere il più a lungo possibile accumulando punti.

Progetto amatoriale, **non ufficiale e senza scopo di lucro**, creato per gioco personale. Nessuna affiliazione con la BBC: nessun logo, font o audio originale della serie è stato utilizzato — grafica ed effetti sonori sono generati interamente via codice.

## Caratteristiche

- **100% offline**: nessuna dipendenza esterna (nessuna CDN, nessun font remoto, nessun asset audio/video). Basta aprire `index.html` o servirlo da un qualsiasi web server statico.
- **Installabile come PWA**: `manifest.json` + `service-worker` (`sw.js`) con strategia cache-first, per installarlo su schermata Home e giocare anche senza connessione.
- **PC e tablet**: controlli da tastiera (frecce/WASD + spazio) e controlli touch a schermo per i dispositivi con schermo tattile, layout responsive con supporto orientamento e "safe area" per notch/home indicator.
- **Grafica vettoriale su Canvas 2D** e **audio sintetizzato** via Web Audio API (nessun file audio da scaricare).
- Record personale salvato in locale (`localStorage`), nessun account o server richiesto.

## Come si gioca

| Azione | Tastiera | Touch |
|---|---|---|
| Ruota + spinta | ⬅️ ➡️ / A D ruotano, ⬆️ / W spinge | pad virtuale: trascina nella direzione voluta |
| Cacciavite sonico (spara) | Spazio | pulsante ⚡ |
| Pausa | P oppure Esc | icona pausa in alto |
| Muto | — | icona altoparlante in alto |

Distruggi i Dalek grandi per farli scindere in unità più piccole e veloci (più punti, ma più difficili da colpire). Ogni tanto rilasciano un potenziamento: cacciavite rapido, scudo temporaneo o vita extra. Ogni 10.000 punti si ottiene una vita bonus.

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
