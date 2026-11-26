# MRInsight · by StructuRad

Hub web personale per la risonanza magnetica: pre-referti, protocolli, appunti e score organizzati per esame.

- **Frontend statico** (GitHub Pages): HTML, CSS e JavaScript senza build.
- **Supabase** per autenticazione, database e immagini.
- **Nessun contenuto privato nel repository**: qui c'è solo il codice. I contenuti stanno in Supabase, protetti da RLS e secondo fattore (aal2).
- **Nessun dato paziente**: si salvano solo modelli generici. Il referto compilato resta nel browser e si copia nel PACS.

## Struttura

```
index.html                 home (provvisoria fino alla fase 2)
test.html                  diagnostica di rete (fase 1)
assets/css/                stile StructuRad in blu
assets/js/config.js        URL progetto + chiave PUBLISHABLE (pubblici)
assets/js/                 moduli ES
assets/img/                logo StructuRad
vendor/                    supabase-js in copia locale (nessun CDN)
supabase/                  migrazioni SQL (dalla fase 2)
```

## Fasi

1. ✅ Pagina di test: sito e Supabase raggiungibili dal PC di reparto
2. Login con email, password e TOTP; RLS su tutte le tabelle e sullo storage
3. RM prostata completa: pre-referto e appunti
4. Editor a blocchi (testo, tabella, immagine, checklist)
5. Collegamenti ⓘ dal referto agli appunti
6. Backup: esportazione completa, immagini comprese
7. Passkey o app personale con QR

## Creare il progetto Supabase

1. Su [supabase.com](https://supabase.com) attiva l'**MFA sul tuo account Supabase** (Account → Security) e salva i recovery codes: servono per rientrare se perdi il telefono.
2. **New project**: nome `MRInsight`, regione **Central EU (Frankfurt)**. Salva la password del database in un password manager.
3. **Authentication → Sign In / Providers**: lascia attivo Email e **disattiva "Allow new users to sign up"**.
4. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password lunga, con conferma automatica. La creazione dalla dashboard funziona anche con la registrazione disattivata.
5. **Project Settings → API Keys**: copia **Project URL** e **Publishable key** (`sb_publishable_…`). La chiave secret non va mai copiata nel sito.
6. Apri `test.html`, incolla i due valori e premi **Verifica connessione**. Se tutto è verde, inseriscili in `assets/js/config.js`.

## Pubblicare su GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
L'indirizzo sarà `https://radios4ndbox-bot.github.io/MRInsight/`, e la diagnostica sarà su `…/MRInsight/test.html`.

## Piano Free di Supabase

- Il progetto va in pausa **dopo 1 settimana di inattività**. Si riattiva con un clic dalla dashboard.
- Il piano Free **non ha backup automatici**: l'esportazione della fase 6 è il tuo backup.
- Il timeout di inattività lato server è solo su Pro, per questo il logout dopo 15 minuti è gestito dal browser.

## Licenze

`vendor/supabase-js-*.umd.js` è distribuito con licenza MIT (vedi `vendor/supabase-js.LICENSE`).
Il logo StructuRad appartiene all'autore.
