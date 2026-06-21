# MIA IVR Control Panel

Prima versione del pannello web per campagne IVR multi-cliente.

## Funzioni incluse

- Dashboard in stile hacker/neon.
- Creazione rapida campagna.
- Incolla numeri in textarea: il pannello normalizza, rimuove duplicati e scarta valori non validi.
- Upload audio IVR e testo per futura generazione vocale.
- Selezione account SIP/Zoiper.
- Sezione crediti Bitcoin pronta per integrazione BTCPay Server.
- Visuale animata in homepage.
- Accesso demo cliente.
- Pagina login demo iniziale con nome utente/password precompilati.
- Registrazione demo con nome utente, password e contatto Telegram.
- Salvataggio locale nel browser per campagne e account SIP demo.
- Generazione account SIP demo.
- Esportazione numeri validati in `.txt`.
- Report CDR demo e checklist integrazioni Asterisk/BTCPay.
- Backend API Express.
- Database SQLite locale.
- Registrazione/login reali con password hashata.
- Token autenticazione per chiamare API campagne e SIP.

## Comandi

```bash
npm install
npm run dev:api
npm run dev:web
npm run build
```

In sviluppo:

- API: `http://localhost:4000`
- Web: `http://localhost:5173`

Credenziali demo create nel database:

```text
Nome utente: cliente_demo
Password: demo1234
Telegram: @cliente_demo
```

## Ambiente

Copia `.env.example` in `.env` e cambia almeno:

```text
AUTH_TOKEN_SECRET=una-stringa-lunga-casuale
```

Il database locale viene creato in `data/mia.sqlite`.
