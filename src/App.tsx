import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AudioLines,
  Bitcoin,
  Bot,
  CheckCircle2,
  ClipboardPaste,
  Headphones,
  ListChecks,
  LockKeyhole,
  PhoneForwarded,
  Play,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

type SipAccount = {
  name: string;
  username: string;
  status: "online" | "offline";
};

type ParsedNumbers = {
  valid: string[];
  duplicates: number;
  rejected: string[];
};

const sipAccounts: SipAccount[] = [
  {
    name: "Operatore Milano",
    username: "cliente01-milano",
    status: "online",
  },
  {
    name: "Operatore Roma",
    username: "cliente01-roma",
    status: "offline",
  },
];

const recentCampaigns = [
  {
    name: "Promo Energia",
    status: "In pausa",
    progress: 62,
    pressed: 148,
  },
  {
    name: "Recall Lead Caldi",
    status: "Pronta",
    progress: 0,
    pressed: 0,
  },
  {
    name: "Servizi Business",
    status: "Completata",
    progress: 100,
    pressed: 391,
  },
];

function normalizePhoneNumber(rawValue: string) {
  const compact = rawValue.replace(/[^\d+]/g, "");

  if (compact.startsWith("+")) {
    return compact;
  }

  if (compact.startsWith("0039")) {
    return `+39${compact.slice(4)}`;
  }

  if (compact.startsWith("39") && compact.length >= 11) {
    return `+${compact}`;
  }

  return compact.length >= 8 ? `+39${compact}` : compact;
}

function parseNumbers(input: string): ParsedNumbers {
  const tokens = input
    .split(/[\s,;|]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: string[] = [];
  const rejected: string[] = [];
  let duplicates = 0;

  tokens.forEach((token) => {
    const normalized = normalizePhoneNumber(token);
    const digits = normalized.replace(/\D/g, "");
    const isItalianNumber =
      normalized.startsWith("+39") && digits.length >= 11 && digits.length <= 13;

    if (!isItalianNumber) {
      rejected.push(token);
      return;
    }

    if (seen.has(normalized)) {
      duplicates += 1;
      return;
    }

    seen.add(normalized);
    valid.push(normalized);
  });

  return { valid, duplicates, rejected };
}

function App() {
  const [numbersInput, setNumbersInput] = useState(
    "3331234567\n+39 347 000 1122\n0039 320 555 0101\n348-555-0199"
  );
  const [ivrText, setIvrText] = useState(
    "Ciao, abbiamo una proposta per te. Premi 1 per parlare subito con un operatore."
  );
  const [campaignName, setCampaignName] = useState("Campagna clienti Italia");
  const [selectedSip, setSelectedSip] = useState(sipAccounts[0].username);
  const [consentConfirmed, setConsentConfirmed] = useState(true);
  const [ivrFileName, setIvrFileName] = useState("Nessun file selezionato");

  const parsedNumbers = useMemo(
    () => parseNumbers(numbersInput),
    [numbersInput]
  );

  const estimatedSeconds = Math.min(
    20,
    Math.max(6, Math.ceil(ivrText.length / 13))
  );
  const canLaunch = parsedNumbers.valid.length > 0 && consentConfirmed;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <RadioTower size={24} />
          </div>
          <div>
            <span className="eyebrow">MIA VOICE OPS</span>
            <h1>IVR Control</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Navigazione principale">
          <a className="nav-item active" href="#campaign">
            <Activity size={18} />
            Dashboard
          </a>
          <a className="nav-item" href="#numbers">
            <ClipboardPaste size={18} />
            Numeri
          </a>
          <a className="nav-item" href="#ivr">
            <AudioLines size={18} />
            IVR
          </a>
          <a className="nav-item" href="#sip">
            <Headphones size={18} />
            SIP Zoiper
          </a>
          <a className="nav-item" href="#billing">
            <Bitcoin size={18} />
            Crediti BTC
          </a>
        </nav>

        <div className="sidebar-card">
          <LockKeyhole size={20} />
          <div>
            <strong>Modalita compliance</strong>
            <span>Consenso, opt-out e log campagna attivi.</span>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="hero">
          <div>
            <span className="eyebrow neon">Pannello clienti semplice</span>
            <h2>Campagne IVR in stile hacker, senza confusione.</h2>
            <p>
              Incolla i numeri, scegli audio o testo IVR, collega un account SIP
              Zoiper e prepara la campagna con limiti canale chiari.
            </p>
          </div>
          <div
            className="chimp-gif"
            role="img"
            aria-label="Scimpanze seduto alla scrivania che effettua chiamate con collane e orologio d'oro"
          >
            <div className="matrix-rain" />
            <div className="desk-monitor">
              <span />
              <span />
              <span />
            </div>
            <div className="phone-base">
              <span className="phone-light" />
              <span className="phone-line one" />
              <span className="phone-line two" />
            </div>
            <div className="chimp-body">
              <div className="gold-chain" />
              <div className="chimp-head">
                <span className="ear left" />
                <span className="ear right" />
                <span className="eye left" />
                <span className="eye right" />
                <span className="mouth" />
                <span className="headset" />
              </div>
              <div className="chimp-arm left">
                <span className="gold-watch" />
              </div>
              <div className="chimp-arm right" />
            </div>
            <div className="desk-line" />
            <div className="call-bubbles">
              <span>CALL</span>
              <span>SIP</span>
              <span>DTMF 1</span>
            </div>
          </div>
          <div className="hero-actions">
            <button className="ghost-button" type="button">
              <Sparkles size={18} />
              Genera IVR
            </button>
            <button className="primary-button" type="button" disabled={!canLaunch}>
              <Play size={18} />
              Avvia test
            </button>
          </div>
        </header>

        <section className="stats-grid" aria-label="Statistiche principali">
          <StatCard
            icon={<RadioTower size={22} />}
            label="Canali globali"
            value="32"
            detail="Da dividere tra tutti i clienti"
          />
          <StatCard
            icon={<Users size={22} />}
            label="Lead validi"
            value={parsedNumbers.valid.length.toString()}
            detail={`${parsedNumbers.duplicates} duplicati rimossi`}
          />
          <StatCard
            icon={<Wallet size={22} />}
            label="Credito demo"
            value="0.018 BTC"
            detail="Wallet cliente collegabile a BTCPay"
          />
          <StatCard
            icon={<PhoneForwarded size={22} />}
            label="Tasto 1"
            value="SIP"
            detail="Instradamento verso Zoiper"
          />
        </section>

        <section className="workspace-grid">
          <div className="panel campaign-panel" id="campaign">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Setup rapido</span>
                <h3>Nuova campagna</h3>
              </div>
              <StatusPill label={canLaunch ? "Pronta" : "Da completare"} />
            </div>

            <label className="field">
              <span>Nome campagna</span>
              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="Es. Promo clienti giugno"
              />
            </label>

            <div className="two-column">
              <label className="field">
                <span>Account SIP destinazione</span>
                <select
                  value={selectedSip}
                  onChange={(event) => setSelectedSip(event.target.value)}
                >
                  {sipAccounts.map((account) => (
                    <option key={account.username} value={account.username}>
                      {account.name} - {account.username}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Limite canali cliente</span>
                <input value="Auto: max 32 condivisi" readOnly />
              </label>
            </div>

            <div className="check-row">
              <input
                id="consent"
                type="checkbox"
                checked={consentConfirmed}
                onChange={(event) => setConsentConfirmed(event.target.checked)}
              />
              <label htmlFor="consent">
                Confermo che i numeri caricati hanno consenso valido e gestione
                opt-out.
              </label>
            </div>

            <div className="launch-card">
              <div>
                <span className="eyebrow">Anteprima routing</span>
                <strong>{campaignName || "Campagna senza nome"}</strong>
                <small>
                  IVR - tasto 1 - {selectedSip} - report CDR/crediti
                </small>
              </div>
              <button className="primary-button" type="button" disabled={!canLaunch}>
                <Zap size={18} />
                Prepara campagna
              </button>
            </div>
          </div>

          <div className="panel" id="numbers">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Copia e incolla</span>
                <h3>Lista numeri</h3>
              </div>
              <ClipboardPaste size={22} />
            </div>
            <textarea
              className="number-box"
              value={numbersInput}
              onChange={(event) => setNumbersInput(event.target.value)}
              placeholder="Incolla qui numeri separati da spazio, virgola, punto e virgola o nuova riga"
              spellCheck={false}
            />
            <div className="number-summary">
              <SummaryItem label="Validi" value={parsedNumbers.valid.length} />
              <SummaryItem label="Duplicati" value={parsedNumbers.duplicates} />
              <SummaryItem label="Scartati" value={parsedNumbers.rejected.length} />
            </div>
            <div className="preview-list">
              {parsedNumbers.valid.slice(0, 5).map((number) => (
                <span key={number}>{number}</span>
              ))}
              {parsedNumbers.valid.length > 5 && (
                <span>+{parsedNumbers.valid.length - 5} altri</span>
              )}
            </div>
          </div>

          <div className="panel" id="ivr">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Audio massimo 20 secondi</span>
                <h3>IVR personalizzato</h3>
              </div>
              <Bot size={22} />
            </div>

            <label className="field">
              <span>Testo da trasformare in voce</span>
              <textarea
                className="ivr-text"
                value={ivrText}
                onChange={(event) => setIvrText(event.target.value)}
              />
            </label>

            <div className="upload-card">
              <Upload size={22} />
              <div>
                <strong>Carica audio WAV/MP3</strong>
                <span>{ivrFileName}</span>
              </div>
              <label className="file-button">
                Scegli file
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) =>
                    setIvrFileName(
                      event.target.files?.[0]?.name ?? "Nessun file selezionato"
                    )
                  }
                />
              </label>
            </div>

            <div className="meter">
              <div>
                <span>Durata stimata</span>
                <strong>{estimatedSeconds}s / 20s</strong>
              </div>
              <div className="meter-track">
                <span style={{ width: `${(estimatedSeconds / 20) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="panel" id="sip">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Zoiper ready</span>
                <h3>Account SIP cliente</h3>
              </div>
              <Headphones size={22} />
            </div>
            <div className="sip-list">
              {sipAccounts.map((account) => (
                <div className="sip-row" key={account.username}>
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.username}@sip.tuodominio.it</span>
                  </div>
                  <StatusPill
                    label={account.status === "online" ? "Online" : "Offline"}
                    tone={account.status === "online" ? "good" : "muted"}
                  />
                </div>
              ))}
            </div>
            <button className="ghost-button full-width" type="button">
              + Genera nuovo account SIP
            </button>
          </div>

          <div className="panel" id="billing">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Crediti</span>
                <h3>Pagamento Bitcoin</h3>
              </div>
              <Bitcoin size={22} />
            </div>
            <div className="btc-card">
              <span>Wallet cliente</span>
              <strong>0.018 BTC</strong>
              <small>Integrazione prevista: BTCPay Server webhook</small>
            </div>
            <div className="security-list">
              <span>
                <CheckCircle2 size={16} /> Accredito dopo conferme
              </span>
              <span>
                <ShieldCheck size={16} /> Stop campagna se credito finito
              </span>
              <span>
                <ListChecks size={16} /> CDR e report costi esportabili
              </span>
            </div>
          </div>

          <div className="panel campaigns-history">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Monitoraggio</span>
                <h3>Campagne recenti</h3>
              </div>
              <Activity size={22} />
            </div>
            {recentCampaigns.map((campaign) => (
              <div className="campaign-row" key={campaign.name}>
                <div>
                  <strong>{campaign.name}</strong>
                  <span>
                    {campaign.status} - {campaign.pressed} utenti hanno premuto 1
                  </span>
                </div>
                <div className="progress">
                  <span style={{ width: `${campaign.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function StatusPill({
  label,
  tone = "accent",
}: {
  label: string;
  tone?: "accent" | "good" | "muted";
}) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default App;
