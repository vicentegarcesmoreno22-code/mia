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
- Accesso cliente.
- Pagina login iniziale con nome utente/password.
- Registrazione con nome utente, password e contatto Telegram.
- Salvataggio su database per campagne e account SIP.
- Generazione account SIP.
- Esportazione numeri validati in `.txt`.
- Report CDR e checklist integrazioni Asterisk/BTCPay.
- Backend API Express.
- Database SQLite locale.
- Registrazione/login reali con password hashata.
- Token autenticazione per chiamare API campagne e SIP.
- Generazione fatture Bitcoin con indirizzo configurato da ambiente.

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

Il database parte senza utenti precompilati: crea il primo account dalla pagina
di registrazione.

## Ambiente

Copia `.env.example` in `.env` e cambia almeno:

```text
AUTH_TOKEN_SECRET=una-stringa-lunga-casuale
BTC_RECEIVE_ADDRESS=il-tuo-indirizzo-bitcoin
```

Il database locale viene creato in `data/mia.sqlite`.
