import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  AudioLines,
  BarChart3,
  Bitcoin,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileText,
  Headphones,
  KeyRound,
  ListChecks,
  LogIn,
  LockKeyhole,
  Mail,
  PhoneForwarded,
  Plus,
  Play,
  RadioTower,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

type SipAccount = {
  id: string;
  name: string;
  username: string;
  password: string;
  status: "online" | "offline";
};

type Campaign = {
  id: string;
  name: string;
  status: "Pronta" | "In pausa" | "Completata";
  progress: number;
  pressed: number;
  total: number;
  sip: string;
  ivr: string;
  createdAt: string;
};

type ParsedNumbers = {
  valid: string[];
  duplicates: number;
  rejected: string[];
};

const defaultSipAccounts: SipAccount[] = [
  {
    id: "sip-1",
    name: "Operatore Milano",
    username: "cliente01-milano",
    password: "zoiper-demo-92K",
    status: "online",
  },
  {
    id: "sip-2",
    name: "Operatore Roma",
    username: "cliente01-roma",
    password: "zoiper-demo-41Q",
    status: "offline",
  },
];

const defaultCampaigns: Campaign[] = [
  {
    id: "camp-1",
    name: "Promo Energia",
    status: "In pausa",
    progress: 62,
    pressed: 148,
    total: 1200,
    sip: "cliente01-milano",
    ivr: "promo-energia.wav",
    createdAt: "21/06/2026, 20:41",
  },
  {
    id: "camp-2",
    name: "Recall Lead Caldi",
    status: "Pronta",
    progress: 0,
    pressed: 0,
    total: 430,
    sip: "cliente01-roma",
    ivr: "tts-richiamata",
    createdAt: "21/06/2026, 21:10",
  },
  {
    id: "camp-3",
    name: "Servizi Business",
    status: "Completata",
    progress: 100,
    pressed: 391,
    total: 2600,
    sip: "cliente01-milano",
    ivr: "business.mp3",
    createdAt: "20/06/2026, 18:05",
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

function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? (JSON.parse(storedValue) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("cliente@demo.it");
  const [loginPassword, setLoginPassword] = useState("demo1234");
  const [clientName] = useLocalStorage("mia.clientName", "Cliente Demo");
  const [campaigns, setCampaigns] = useLocalStorage<Campaign[]>(
    "mia.campaigns",
    defaultCampaigns
  );
  const [sipList, setSipList] = useLocalStorage<SipAccount[]>(
    "mia.sipAccounts",
    defaultSipAccounts
  );
  const [invoiceMessage, setInvoiceMessage] = useState(
    "Nessuna fattura Bitcoin aperta"
  );
  const [numbersInput, setNumbersInput] = useState(
    "3331234567\n+39 347 000 1122\n0039 320 555 0101\n348-555-0199"
  );
  const [ivrText, setIvrText] = useState(
    "Ciao, abbiamo una proposta per te. Premi 1 per parlare subito con un operatore."
  );
  const [campaignName, setCampaignName] = useState("Campagna clienti Italia");
  const [selectedSip, setSelectedSip] = useState(sipList[0]?.username ?? "");
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
  const selectedSipTarget = sipList.some(
    (account) => account.username === selectedSip
  )
    ? selectedSip
    : (sipList[0]?.username ?? "");
  const canLaunch =
    parsedNumbers.valid.length > 0 && consentConfirmed && selectedSipTarget !== "";
  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status !== "Completata"
  ).length;
  const totalPressed = campaigns.reduce(
    (sum, campaign) => sum + campaign.pressed,
    0
  );

  const handlePrepareCampaign = () => {
    if (!canLaunch) {
      return;
    }

    const newCampaign: Campaign = {
      id: `camp-${Date.now()}`,
      name: campaignName.trim() || "Campagna senza nome",
      status: "Pronta",
      progress: 0,
      pressed: 0,
      total: parsedNumbers.valid.length,
      sip: selectedSipTarget,
      ivr:
        ivrFileName !== "Nessun file selezionato"
          ? ivrFileName
          : `TTS ${estimatedSeconds}s`,
      createdAt: new Date().toLocaleString("it-IT"),
    };

    setCampaigns([newCampaign, ...campaigns]);
  };

  const handleGenerateSip = () => {
    const nextNumber = sipList.length + 1;
    const newAccount: SipAccount = {
      id: `sip-${Date.now()}`,
      name: `Operatore ${nextNumber}`,
      username: `cliente01-operatore${nextNumber}`,
      password: `sip-${Math.random().toString(36).slice(2, 10)}`,
      status: "offline",
    };

    setSipList([...sipList, newAccount]);
    setSelectedSip(newAccount.username);
  };

  const handleDownloadNumbers = () => {
    const file = new Blob([parsedNumbers.valid.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "numeri-validati.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateIvr = () => {
    setIvrText(
      "Ciao, ti stiamo chiamando per una richiesta autorizzata. Premi 1 per parlare con un operatore, oppure riaggancia per non essere ricontattato."
    );
  };

  const handleCreateInvoice = () => {
    setInvoiceMessage(
      `Fattura demo generata: ${new Date().toLocaleTimeString("it-IT")} - attesa conferme BTC`
    );
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        email={loginEmail}
        password={loginPassword}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onLogin={handleLogin}
      />
    );
  }

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
          <a className="nav-item" href="#reports">
            <BarChart3 size={18} />
            Report
          </a>
          <a className="nav-item" href="#system">
            <ServerCog size={18} />
            Sistema
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
        <section className="top-strip" aria-label="Sessione cliente">
          <div>
            <span className="eyebrow">Accesso demo</span>
            <strong>{clientName}</strong>
            <small>Ruolo: cliente - Piano: 32 canali condivisi</small>
          </div>
          <div className="top-strip-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={handleDownloadNumbers}
              disabled={parsedNumbers.valid.length === 0}
            >
              <Download size={18} />
              Scarica numeri validi
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setIsAuthenticated(false)}
            >
              <KeyRound size={18} />
              Esci
            </button>
          </div>
        </section>

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
            <button className="ghost-button" type="button" onClick={handleGenerateIvr}>
              <Sparkles size={18} />
              Genera IVR
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!canLaunch}
              onClick={handlePrepareCampaign}
            >
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
            icon={<CalendarClock size={22} />}
            label="Campagne attive"
            value={activeCampaigns.toString()}
            detail={`${campaigns.length} campagne salvate nel browser`}
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
            detail={`${totalPressed} pressioni registrate`}
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
                  value={selectedSipTarget}
                  onChange={(event) => setSelectedSip(event.target.value)}
                >
                  {sipList.map((account) => (
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
                  IVR - tasto 1 - {selectedSipTarget} - report CDR/crediti
                </small>
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={!canLaunch}
                onClick={handlePrepareCampaign}
              >
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
            {parsedNumbers.rejected.length > 0 && (
              <p className="hint danger">
                Scartati: {parsedNumbers.rejected.slice(0, 4).join(", ")}
                {parsedNumbers.rejected.length > 4 ? "..." : ""}
              </p>
            )}
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
              {sipList.map((account) => (
                <div className="sip-row" key={account.username}>
                  <div>
                    <strong>{account.name}</strong>
                    <span>{account.username}@sip.tuodominio.it</span>
                    <small>Password demo: {account.password}</small>
                  </div>
                  <StatusPill
                    label={account.status === "online" ? "Online" : "Offline"}
                    tone={account.status === "online" ? "good" : "muted"}
                  />
                </div>
              ))}
            </div>
            <button
              className="ghost-button full-width"
              type="button"
              onClick={handleGenerateSip}
            >
              <Plus size={18} />
              Genera nuovo account SIP
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
              <small>{invoiceMessage}</small>
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
            <button
              className="ghost-button full-width"
              type="button"
              onClick={handleCreateInvoice}
            >
              <Bitcoin size={18} />
              Genera fattura BTC demo
            </button>
          </div>

          <div className="panel campaigns-history" id="reports">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Monitoraggio</span>
                <h3>Campagne recenti</h3>
              </div>
              <Activity size={22} />
            </div>
            {campaigns.map((campaign) => (
              <div className="campaign-row" key={campaign.id}>
                <div>
                  <strong>{campaign.name}</strong>
                  <span>
                    {campaign.status} - {campaign.pressed} utenti hanno premuto 1
                    su {campaign.total} numeri
                  </span>
                  <small>
                    SIP: {campaign.sip} - IVR: {campaign.ivr} - {campaign.createdAt}
                  </small>
                </div>
                <div className="progress">
                  <span style={{ width: `${campaign.progress}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="panel reports-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CDR demo</span>
                <h3>Report chiamate</h3>
              </div>
              <FileText size={22} />
            </div>
            <div className="report-table" role="table" aria-label="Report chiamate">
              <div role="row">
                <strong>Numero</strong>
                <strong>Esito</strong>
                <strong>Durata</strong>
                <strong>Costo</strong>
              </div>
              {parsedNumbers.valid.slice(0, 4).map((number, index) => (
                <div role="row" key={number}>
                  <span>{number}</span>
                  <span>{index % 2 === 0 ? "Premuto 1" : "Ascoltato IVR"}</span>
                  <span>{12 + index * 7}s</span>
                  <span>{(0.000004 + index * 0.000001).toFixed(6)} BTC</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel system-panel" id="system">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Prossime integrazioni</span>
                <h3>Stato sistema</h3>
              </div>
              <ServerCog size={22} />
            </div>
            <div className="integration-grid">
              <IntegrationItem
                title="Frontend clienti"
                detail="Creato: dashboard, numeri, IVR, SIP, crediti e report demo."
                done
              />
              <IntegrationItem
                title="Backend/API"
                detail="Da collegare: utenti reali, database, permessi e salvataggio server."
              />
              <IntegrationItem
                title="Asterisk AMI/ARI"
                detail="Da collegare: origination chiamate, DTMF 1, limiti 32 canali e CDR."
              />
              <IntegrationItem
                title="BTCPay Server"
                detail="Da collegare: fatture Bitcoin, webhook e accredito automatico."
              />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function LoginPage({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onLogin,
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark">
            <RadioTower size={24} />
          </div>
          <div>
            <span className="eyebrow neon">MIA VOICE OPS</span>
            <h1>Accesso pannello IVR</h1>
          </div>
        </div>

        <div className="login-grid">
          <div className="login-copy">
            <span className="eyebrow">Area clienti</span>
            <h2>Entra, incolla i numeri e prepara la tua campagna.</h2>
            <p>
              Interfaccia semplice per clienti: crediti, liste, IVR, account SIP
              Zoiper e report in un unico pannello.
            </p>

            <div className="login-feature-list">
              <span>
                <ShieldCheck size={17} /> Consenso e opt-out visibili
              </span>
              <span>
                <Bitcoin size={17} /> Crediti Bitcoin demo
              </span>
              <span>
                <Headphones size={17} /> Trasferimento verso SIP/Zoiper
              </span>
            </div>
          </div>

          <form className="login-form" onSubmit={onLogin}>
            <div className="login-form-heading">
              <UserCheck size={24} />
              <div>
                <strong>Login demo</strong>
                <span>Usa i dati già compilati per vedere il pannello.</span>
              </div>
            </div>

            <label className="field">
              <span>Email cliente</span>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="cliente@demo.it"
                />
              </div>
            </label>

            <label className="field">
              <span>Password</span>
              <div className="input-with-icon">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="demo1234"
                />
              </div>
            </label>

            <button className="primary-button full-width" type="submit">
              <LogIn size={18} />
              Entra nel pannello
            </button>

            <div className="login-demo-note">
              <LockKeyhole size={16} />
              <span>
                Questa e una schermata demo: il prossimo step sara collegarla a
                backend, database e ruoli reali.
              </span>
            </div>
          </form>
        </div>
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

function IntegrationItem({
  title,
  detail,
  done = false,
}: {
  title: string;
  detail: string;
  done?: boolean;
}) {
  return (
    <article className="integration-item">
      <div className={done ? "integration-dot done" : "integration-dot"} />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

export default App;
