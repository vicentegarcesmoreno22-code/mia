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
- Wallet crediti cliente.
- Generazione fatture Bitcoin collegate a crediti da accreditare.
- Webhook Bitcoin/BTCPay per segnare la fattura pagata e ricaricare il saldo.

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
BITCOIN_WEBHOOK_SECRET=segreto-webhook
```

Il database locale viene creato in `data/mia.sqlite`.

## Ricarica crediti Bitcoin

1. Il cliente inserisce quanti crediti vuole ricaricare.
2. Il pannello genera una fattura BTC.
3. Quando il pagamento viene confermato dal processore Bitcoin, chiama:

```http
POST /api/webhooks/bitcoin
X-Webhook-Secret: segreto-webhook
Content-Type: application/json

{
  "invoiceId": "BTC-XXXXXXXX",
  "status": "paid"
}
```

Stati accettati come pagamento confermato: `paid`, `settled`, `confirmed`,
`complete`, `completed`.

Quando il webhook arriva, il backend marca la fattura come pagata e aggiunge i
crediti al wallet del cliente una sola volta.
