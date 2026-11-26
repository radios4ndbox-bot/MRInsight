# MRInsight · by StructuRad

Hub web personale per la risonanza magnetica: pre-referti, protocolli, appunti e score organizzati per esame.

- **Frontend statico** (GitHub Pages): HTML, CSS e JavaScript senza build.
- **Supabase** per autenticazione, database e immagini.
- **Nessun contenuto privato nel repository**: qui c'è solo il codice. I contenuti stanno in Supabase, protetti da RLS e secondo fattore (aal2).
- **Nessun dato paziente**: si salvano solo modelli generici. Il referto compilato resta nel browser e si copia nel PACS.

## Struttura

```
index.html                 app: accesso, TOTP, area privata
test.html                  diagnostica di rete (fase 1)
assets/css/                stile StructuRad in blu
assets/js/config.js        URL progetto + chiave PUBLISHABLE (pubblici)
assets/js/                 moduli ES
assets/img/                logo StructuRad
assets/models/corpo.bin    modello 3D del corpo (BodyParts3D, CC BY 4.0)
vendor/                    supabase-js in copia locale (nessun CDN)
tools/                     script di sviluppo (non pubblicati nel sito)
supabase/migrations/       migrazioni SQL da eseguire nel SQL Editor
.github/workflows/         keep-alive del progetto (piano Free)
```

## Fasi

1. ✅ Pagina di test: sito e Supabase raggiungibili dal PC di reparto
2. ✅ Login con email, password e TOTP; RLS su tutte le tabelle e sullo storage
3. ✅ MRI progress: mappa 3D del corpo a zone, esami per zona
4. Appunti di ogni esame: pagine con editor a blocchi (testo, tabella, immagine, checklist)
5. MRI reports: pre-referti per esame e area valutata, con collegamenti ⓘ agli appunti
6. Backup: esportazione completa, immagini comprese
7. Passkey o app personale con QR

## Creare il progetto Supabase

1. Su [supabase.com](https://supabase.com) attiva l'**MFA sul tuo account Supabase** (Account → Security) e salva i recovery codes: servono per rientrare se perdi il telefono.
2. **New project**: nome `MRInsight`, regione **Central EU (Frankfurt)**. Salva la password del database in un password manager.
3. **Authentication → Sign In / Providers**: lascia attivo Email e **disattiva "Allow new users to sign up"**.
4. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password lunga, con conferma automatica. La creazione dalla dashboard funziona anche con la registrazione disattivata.
5. **Project Settings → API Keys**: copia **Project URL** e **Publishable key** (`sb_publishable_…`). La chiave secret non va mai copiata nel sito.
6. Apri `test.html`, incolla i due valori e premi **Verifica connessione**. Se tutto è verde, inseriscili in `assets/js/config.js`.

## Fase 2: database e accesso

1. In Supabase apri **SQL Editor → New query**, incolla tutto il contenuto di `supabase/migrations/0001_schema_rls.sql` e premi **Run**. Il risultato atteso è "Success. No rows returned".
2. Inserisci URL e chiave publishable in `assets/js/config.js`, poi pubblica.
3. Apri il sito e accedi con email e password. Al primo accesso MRInsight chiede di registrare l'app authenticator: inquadri il QR e inserisci il codice.
4. Vai in **Sicurezza → Aggiungi dispositivo** e registra un **secondo** dispositivo, per esempio un tablet o un secondo telefono. In alternativa stampa la chiave mostrata sotto il QR e conservala in un luogo sicuro.
5. In **Esami → Stato dell'accesso** tutte le voci devono essere verdi, compresa *RLS senza secondo fattore*.
6. **Actions → Keep-alive Supabase → Run workflow**: verifica che il ping funzioni.

### Migrazione 0002: zone degli esami

In **SQL Editor → New query** incolla `supabase/migrations/0002_zone_esami.sql` e premi **Run**. Aggiunge la zona anatomica agli esami; le policy RLS restano quelle della 0001.

### Come funziona la protezione

- Ogni tabella ha due policy:
  - una **permissiva**: solo le righe con `user_id = auth.uid()`;
  - una **restrittiva**: solo con `aal2`, cioè password più TOTP verificato.
- Con la sola password il database non restituisce né accetta nulla.
- Lo stesso vale per il bucket privato `media`: i file sono in `<user_id>/…`.
- Il controllo `aal2` è in un'unica funzione, `private.is_strong_auth()`. In futuro accetterà anche passkey o l'app con QR senza dover riscrivere le policy.
- Il ruolo `anon` non ha accesso a nessuna tabella. L'unica funzione pubblica è `ping()`, che restituisce solo l'ora.
- Supabase non permette di registrare un nuovo fattore con la sola password se ne esiste già uno verificato.

### Recupero dell'accesso

| Situazione | Cosa fare |
|---|---|
| Telefono perso, secondo dispositivo disponibile | Accedi con il secondo dispositivo, poi Sicurezza → rimuovi quello perso e registra il nuovo telefono. |
| Nessun dispositivo, ma hai la chiave stampata | Aggiungila a una nuova app authenticator: genera gli stessi codici. |
| Nessun dispositivo e nessuna chiave | Accedi a supabase.com (usa i recovery codes dell'account se serve) → SQL Editor → `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'TUA_EMAIL');`. Al login successivo registri un nuovo fattore. Fallo subito dopo aver eseguito la query. |
| Password dimenticata | SQL Editor → `update auth.users set encrypted_password = extensions.crypt('NUOVA_PASSWORD', extensions.gen_salt('bf')) where email = 'TUA_EMAIL';`. Il secondo fattore resta comunque necessario. Il reset via email arriverà in una fase successiva. |

## Pubblicare su GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
L'indirizzo sarà `https://radios4ndbox-bot.github.io/MRInsight/`, e la diagnostica sarà su `…/MRInsight/test.html`.

## Piano Free di Supabase

- Il progetto va in pausa **dopo 1 settimana di inattività**. Si riattiva con un clic dalla dashboard.
- Il piano Free **non ha backup automatici**: l'esportazione della fase 6 è il tuo backup.
- Il timeout di inattività lato server è solo su Pro, per questo il logout dopo 1 ora di inattività è gestito dal browser. Ricaricare la pagina non fa uscire; chiudere la scheda sì.

## Licenze

`vendor/supabase-js-*.umd.js` è distribuito con licenza MIT (vedi `vendor/supabase-js.LICENSE`).
Il modello 3D `assets/models/corpo.bin` è ricavato da BodyParts3D, © The Database Center for Life Science, licenza CC BY 4.0 (dettagli in `assets/models/ATTRIBUTION.md`).
Il logo StructuRad appartiene all'autore.
