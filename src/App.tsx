import { useCallback, useEffect, useMemo, useState } from "react";
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
  Copy,
  Download,
  FileText,
  Headphones,
  KeyRound,
  ListChecks,
  LogIn,
  LockKeyhole,
  MessageCircle,
  PhoneForwarded,
  Plus,
  Play,
  RadioTower,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserPlus,
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

type ApiUser = {
  id: number;
  username: string;
  telegram: string;
  role: "client" | "admin";
};

type BitcoinInvoice = {
  id: string;
  amountBtc: string;
  creditAmount: string;
  btcAddress: string;
  status: "pending" | "paid";
  createdAt: string;
  paidAt: string | null;
};

type AdminOverview = {
  clients: number;
  campaigns: number;
  readyCampaigns: number;
  totalWalletCredits: string;
};

type AdminQueueItem = {
  number: string;
  client: string;
  campaignId: string;
  campaignName: string;
  sip: string;
  ivr: string;
};

type ParsedNumbers = {
  valid: string[];
  duplicates: number;
  rejected: string[];
};

const emptySipAccounts: SipAccount[] = [];
const emptyCampaigns: Campaign[] = [];

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

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "Errore API";
  } catch {
    return "Errore API";
  }
}

function App() {
  const [authToken, setAuthToken] = useLocalStorage("mia.authToken", "");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerTelegram, setRegisterTelegram] = useState("");
  const [authMessage, setAuthMessage] = useState(
    "Registrati oppure accedi con le tue credenziali."
  );
  const [clientName, setClientName] = useLocalStorage(
    "mia.clientName",
    "Cliente"
  );
  const [currentUser, setCurrentUser] = useLocalStorage<ApiUser | null>(
    "mia.currentUser",
    null
  );
  const [campaigns, setCampaigns] = useLocalStorage<Campaign[]>(
    "mia.campaigns",
    emptyCampaigns
  );
  const [sipList, setSipList] = useLocalStorage<SipAccount[]>(
    "mia.sipAccounts",
    emptySipAccounts
  );
  const [currentInvoice, setCurrentInvoice] = useState<BitcoinInvoice | null>(
    null
  );
  const [walletBalance, setWalletBalance] = useState("0.00");
  const [actionMessage, setActionMessage] = useState(
    "Pannello pronto. Crea un account SIP, incolla i numeri e prepara la campagna."
  );
  const [rechargeCredits, setRechargeCredits] = useState("10.00");
  const [rechargeBtc, setRechargeBtc] = useState("0.001");
  const [invoiceMessage, setInvoiceMessage] = useState(
    "Nessuna fattura Bitcoin aperta"
  );
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminQueue, setAdminQueue] = useState<AdminQueueItem[]>([]);
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
  const canLaunch = parsedNumbers.valid.length > 0 && consentConfirmed && selectedSipTarget !== "";
  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status !== "Completata"
  ).length;
  const totalPressed = campaigns.reduce(
    (sum, campaign) => sum + campaign.pressed,
    0
  );
  const isAdmin = currentUser?.role === "admin";

  const handlePrepareCampaign = () => {
    if (!canLaunch) {
      if (parsedNumbers.valid.length === 0) {
        setActionMessage("Aggiungi almeno un numero valido prima di preparare la campagna.");
        return;
      }

      if (!consentConfirmed) {
        setActionMessage("Conferma consenso e opt-out prima di preparare la campagna.");
        return;
      }

      if (!selectedSipTarget) {
        setActionMessage("Genera prima un account SIP, poi potrai preparare la campagna.");
        document.querySelector("#sip")?.scrollIntoView({ behavior: "smooth" });
        return;
      }

      setActionMessage("Completa i dati mancanti prima di preparare la campagna.");
      return;
    }

    void (async () => {
      setActionMessage("Salvataggio campagna in corso...");
      const payload = {
        name: campaignName.trim() || "Campagna senza nome",
        total: parsedNumbers.valid.length,
        sip: selectedSipTarget,
        ivr:
          ivrFileName !== "Nessun file selezionato"
            ? ivrFileName
            : `TTS ${estimatedSeconds}s`,
        numbers: parsedNumbers.valid,
      };

      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setActionMessage(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { campaign: Campaign };
      setCampaigns([body.campaign, ...campaigns]);
      setActionMessage("Campagna salvata nel database.");
    })();
  };

  const handleGenerateSip = () => {
    const nextNumber = sipList.length + 1;
    const newAccount = {
      name: `Operatore ${nextNumber}`,
      username: `cliente01-operatore${nextNumber}`,
      password: `sip-${Math.random().toString(36).slice(2, 10)}`,
    };

    void (async () => {
      setActionMessage("Creazione account SIP in corso...");
      const response = await fetch("/api/sip-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(newAccount),
      });

      if (!response.ok) {
        setActionMessage(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { account: SipAccount };
      setSipList([...sipList, body.account]);
      setSelectedSip(body.account.username);
      setActionMessage("Account SIP salvato nel database e selezionato per la campagna.");
    })();
  };

  const handleDownloadNumbers = () => {
    if (parsedNumbers.valid.length === 0) {
      setActionMessage("Non ci sono numeri validi da scaricare.");
      return;
    }

    const file = new Blob([parsedNumbers.valid.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "numeri-validati.txt";
    link.click();
    URL.revokeObjectURL(url);
    setActionMessage(`Scaricati ${parsedNumbers.valid.length} numeri validi.`);
  };

  const handleGenerateIvr = () => {
    setIvrText(
      "Ciao, ti stiamo chiamando per una richiesta autorizzata. Premi 1 per parlare con un operatore, oppure riaggancia per non essere ricontattato."
    );
    setActionMessage("Testo IVR generato. Puoi modificarlo prima di salvare la campagna.");
    document.querySelector("#ivr")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCreateInvoice = () => {
    void (async () => {
      setInvoiceMessage("Generazione fattura in corso...");
      setActionMessage("Creazione fattura Bitcoin in corso...");
      const creditAmount = Number(rechargeCredits);
      if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        setInvoiceMessage("Inserisci un importo crediti valido.");
        setActionMessage("Inserisci un importo crediti valido.");
        return;
      }

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          amountBtc: rechargeBtc,
          creditAmount,
        }),
      });

      if (!response.ok) {
        setCurrentInvoice(null);
        const error = await readApiError(response);
        setInvoiceMessage(error);
        setActionMessage(error);
        return;
      }

      const body = (await response.json()) as { invoice: BitcoinInvoice };
      setCurrentInvoice(body.invoice);
      setInvoiceMessage("Fattura creata. In attesa pagamento BTC.");
      setActionMessage("Fattura Bitcoin creata. Copia l'indirizzo e attendi la conferma pagamento.");
    })();
  };

  const handleCopyInvoiceAddress = () => {
    if (!currentInvoice) {
      return;
    }

    void navigator.clipboard.writeText(currentInvoice.btcAddress);
    setInvoiceMessage("Indirizzo BTC copiato negli appunti.");
    setActionMessage("Indirizzo BTC copiato negli appunti.");
  };

  const handleRefreshPayments = () => {
    if (!authToken) {
      return;
    }

    void (async () => {
      await loadServerState(authToken);
      if (!currentInvoice) {
        setInvoiceMessage("Nessuna fattura Bitcoin aperta");
        setActionMessage("Non ci sono fatture da verificare. Genera prima una fattura BTC.");
        return;
      }

      setInvoiceMessage("Saldo e fatture aggiornati.");
      setActionMessage(
        "Saldo e fatture aggiornati. Se il webhook ha confermato il pagamento, i crediti sono gia accreditati."
      );
    })();
  };

  const loadAdminState = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [overviewResponse, queueResponse] = await Promise.all([
      fetch("/api/admin/overview", { headers }),
      fetch("/api/admin/call-queue?limit=32", { headers }),
    ]);

    if (overviewResponse.ok) {
      const body = (await overviewResponse.json()) as {
        overview: AdminOverview;
      };
      setAdminOverview(body.overview);
    }

    if (queueResponse.ok) {
      const body = (await queueResponse.json()) as {
        queue: AdminQueueItem[];
      };
      setAdminQueue(body.queue);
    }
  }, []);

  const handleRandomizeCallQueue = () => {
    if (!authToken) {
      return;
    }

    void (async () => {
      setActionMessage("Genero coda chiamate random mischiando clienti diversi...");
      await loadAdminState(authToken);
      setActionMessage("Coda chiamate random aggiornata. Verranno usate massimo 32 chiamate globali.");
    })();
  };

  const loadServerState = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [campaignsResponse, sipResponse, walletResponse, invoicesResponse] =
      await Promise.all([
      fetch("/api/campaigns", { headers }),
      fetch("/api/sip-accounts", { headers }),
      fetch("/api/wallet", { headers }),
      fetch("/api/invoices", { headers }),
    ]);

    if (campaignsResponse.ok) {
      const body = (await campaignsResponse.json()) as { campaigns: Campaign[] };
      setCampaigns(body.campaigns);
    }

    if (sipResponse.ok) {
      const body = (await sipResponse.json()) as { accounts: SipAccount[] };
      setSipList(body.accounts);
      setSelectedSip(body.accounts[0]?.username ?? "");
    }

    if (walletResponse.ok) {
      const body = (await walletResponse.json()) as {
        wallet: { balanceCredits: string };
      };
      setWalletBalance(body.wallet.balanceCredits);
    }

    if (invoicesResponse.ok) {
      const body = (await invoicesResponse.json()) as {
        invoices: BitcoinInvoice[];
      };
      setCurrentInvoice(body.invoices[0] ?? null);
    }
  }, [setCampaigns, setSipList]);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    void (async () => {
      const response = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {
        setAuthToken("");
        setCampaigns([]);
        setSipList([]);
        setCurrentUser(null);
        setIsAuthenticated(false);
        return;
      }

      const body = (await response.json()) as { user: ApiUser };
      setCurrentUser(body.user);
      setClientName(body.user.username);
      await loadServerState(authToken);
      if (body.user.role === "admin") {
        await loadAdminState(authToken);
      } else {
        setAdminOverview(null);
        setAdminQueue([]);
      }
      setIsAuthenticated(true);
    })();
  }, [
    authToken,
    loadAdminState,
    loadServerState,
    setAuthToken,
    setCampaigns,
    setClientName,
    setCurrentUser,
    setSipList,
  ]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void (async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        setAuthMessage(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { token: string; user: ApiUser };
      setAuthToken(body.token);
      setCurrentUser(body.user);
      setClientName(body.user.username);
      setAuthMessage(`Accesso effettuato come ${body.user.username}.`);
      await loadServerState(body.token);
      if (body.user.role === "admin") {
        await loadAdminState(body.token);
      }
      setIsAuthenticated(true);
    })();
  };

  const handleRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void (async () => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: registerUsername.trim(),
          password: registerPassword,
          telegram: registerTelegram.trim(),
        }),
      });

      if (!response.ok) {
        setAuthMessage(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { token: string; user: ApiUser };
      setAuthToken(body.token);
      setCurrentUser(body.user);
      setClientName(body.user.username);
      setLoginUsername(body.user.username);
      setLoginPassword(registerPassword);
      setAuthMessage(
        `Registrazione completata. Telegram salvato: ${body.user.telegram}.`
      );
      await loadServerState(body.token);
      setIsAuthenticated(true);
    })();
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        mode={authMode}
        loginUsername={loginUsername}
        loginPassword={loginPassword}
        registerUsername={registerUsername}
        registerPassword={registerPassword}
        registerTelegram={registerTelegram}
        message={authMessage}
        onModeChange={setAuthMode}
        onLoginUsernameChange={setLoginUsername}
        onLoginPasswordChange={setLoginPassword}
        onRegisterUsernameChange={setRegisterUsername}
        onRegisterPasswordChange={setRegisterPassword}
        onRegisterTelegramChange={setRegisterTelegram}
        onLogin={handleLogin}
        onRegister={handleRegister}
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
          {isAdmin && (
            <a className="nav-item" href="#system">
              <ServerCog size={18} />
              Admin
            </a>
          )}
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
            <span className="eyebrow">Accesso</span>
            <strong>{clientName}</strong>
            <small>
              Ruolo: {currentUser?.role ?? "client"} - Telegram:{" "}
              {currentUser?.telegram ?? "non impostato"} - Piano: 32 canali
              condivisi
            </small>
          </div>
          <div className="top-strip-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={handleDownloadNumbers}
            >
              <Download size={18} />
              Scarica numeri validi
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setAuthToken("");
                setCurrentUser(null);
                setCampaigns([]);
                setSipList([]);
                setWalletBalance("0.00");
                setCurrentInvoice(null);
                setAdminOverview(null);
                setAdminQueue([]);
                setActionMessage("Sessione chiusa.");
                setIsAuthenticated(false);
              }}
            >
              <KeyRound size={18} />
              Esci
            </button>
          </div>
        </section>

        <div className="action-banner" role="status" aria-live="polite">
          <Zap size={18} />
          <span>{actionMessage}</span>
        </div>

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
            detail={`${campaigns.length} campagne salvate nel database`}
          />
          <StatCard
            icon={<Wallet size={22} />}
            label="Credito"
            value={walletBalance}
            detail="Saldo crediti disponibile"
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
                  onChange={(event) => {
                    setSelectedSip(event.target.value);
                    setActionMessage("Account SIP selezionato per la campagna.");
                  }}
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
                  onChange={(event) => {
                    const fileName =
                      event.target.files?.[0]?.name ?? "Nessun file selezionato";
                    setIvrFileName(fileName);
                    setActionMessage(
                      fileName === "Nessun file selezionato"
                        ? "Nessun audio selezionato."
                        : `Audio IVR selezionato: ${fileName}`
                    );
                  }}
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
                    <small>Password: {account.password}</small>
                  </div>
                  <StatusPill
                    label={account.status === "online" ? "Online" : "Offline"}
                    tone={account.status === "online" ? "good" : "muted"}
                  />
                </div>
              ))}
              {sipList.length === 0 && (
                <div className="empty-state">
                  Nessun account SIP creato. Premi il pulsante sotto per generarne uno.
                </div>
              )}
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
              <span>Saldo crediti</span>
              <strong>{walletBalance}</strong>
              <small>{invoiceMessage}</small>
            </div>
            <div className="recharge-grid">
              <label className="field">
                <span>Crediti da ricaricare</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rechargeCredits}
                  onChange={(event) => setRechargeCredits(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Importo BTC</span>
                <input
                  type="text"
                  value={rechargeBtc}
                  onChange={(event) => setRechargeBtc(event.target.value)}
                />
              </label>
            </div>
            {currentInvoice && (
              <div className="invoice-card">
                <div className="invoice-header">
                  <div>
                    <span className="eyebrow">Fattura BTC</span>
                    <strong>{currentInvoice.id}</strong>
                  </div>
                  <StatusPill
                    label={
                      currentInvoice.status === "paid"
                        ? "Pagata"
                        : "In attesa"
                    }
                    tone={currentInvoice.status === "paid" ? "good" : "accent"}
                  />
                </div>
                <div className="invoice-grid">
                  <div>
                    <span>Crediti</span>
                    <strong>{currentInvoice.creditAmount}</strong>
                  </div>
                  <div>
                    <span>Pagamento</span>
                    <strong>{currentInvoice.amountBtc} BTC</strong>
                  </div>
                  <div>
                    <span>Creata</span>
                    <strong>
                      {new Date(currentInvoice.createdAt).toLocaleString("it-IT")}
                    </strong>
                  </div>
                  {currentInvoice.paidAt && (
                    <div>
                      <span>Pagata</span>
                      <strong>
                        {new Date(currentInvoice.paidAt).toLocaleString("it-IT")}
                      </strong>
                    </div>
                  )}
                </div>
                <div className="invoice-address">
                  <span>Indirizzo BTC</span>
                  <code>{currentInvoice.btcAddress}</code>
                  <button
                    className="ghost-button full-width"
                    type="button"
                    onClick={handleCopyInvoiceAddress}
                  >
                    <Copy size={18} />
                    Copia indirizzo
                  </button>
                </div>
              </div>
            )}
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
              Genera fattura BTC
            </button>
            <button
              className="ghost-button full-width"
              type="button"
              onClick={handleRefreshPayments}
            >
              <Wallet size={18} />
              Verifica pagamento e aggiorna crediti
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
            {campaigns.length === 0 && (
              <div className="empty-state">
                Nessuna campagna salvata. Compila il setup e premi Prepara campagna.
              </div>
            )}
          </div>

          <div className="panel reports-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CDR</span>
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

          {isAdmin && (
            <div className="panel system-panel" id="system">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Area admin</span>
                  <h3>Sistema e coda globale</h3>
                </div>
                <ServerCog size={22} />
              </div>

              <div className="admin-overview">
                <SummaryItem label="Clienti" value={adminOverview?.clients ?? 0} />
                <SummaryItem
                  label="Campagne"
                  value={adminOverview?.campaigns ?? 0}
                />
                <SummaryItem
                  label="Pronte"
                  value={adminOverview?.readyCampaigns ?? 0}
                />
              </div>

              <button
                className="primary-button full-width"
                type="button"
                onClick={handleRandomizeCallQueue}
              >
                <Zap size={18} />
                Mischia chiamate clienti
              </button>

              <div className="admin-queue">
                <div className="panel-heading compact">
                  <div>
                    <span className="eyebrow">Max 32 globali</span>
                    <h3>Coda random</h3>
                  </div>
                  <StatusPill label={`${adminQueue.length} chiamate`} />
                </div>
                {adminQueue.map((item, index) => (
                  <div
                    className="queue-row"
                    key={`${item.campaignId}-${item.number}-${index}`}
                  >
                    <strong>#{index + 1} {item.number}</strong>
                    <span>
                      Cliente: {item.client} - Campagna: {item.campaignName}
                    </span>
                    <small>
                      SIP: {item.sip} - IVR: {item.ivr}
                    </small>
                  </div>
                ))}
                {adminQueue.length === 0 && (
                  <div className="empty-state">
                    Nessuna chiamata in coda. Servono campagne pronte con numeri
                    caricati dai clienti.
                  </div>
                )}
              </div>

              <div className="integration-grid">
                <IntegrationItem
                  title="Frontend clienti"
                  detail="Visibile ai clienti senza dettagli Asterisk, gateway o BTCPay."
                  done
                />
                <IntegrationItem
                  title="Coda chiamate random"
                  detail="Admin vede una coda mischiata tra campagne di clienti diversi, massimo 32 chiamate globali."
                  done
                />
                <IntegrationItem
                  title="Asterisk AMI/ARI"
                  detail="Solo admin: qui andra collegata l'origine reale delle chiamate e il limite canali."
                />
                <IntegrationItem
                  title="BTCPay Server"
                  detail="Solo admin: qui andra collegato il webhook reale per confermare i pagamenti."
                />
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function LoginPage({
  mode,
  loginUsername,
  loginPassword,
  registerUsername,
  registerPassword,
  registerTelegram,
  message,
  onModeChange,
  onLoginUsernameChange,
  onLoginPasswordChange,
  onRegisterUsernameChange,
  onRegisterPasswordChange,
  onRegisterTelegramChange,
  onLogin,
  onRegister,
}: {
  mode: "login" | "register";
  loginUsername: string;
  loginPassword: string;
  registerUsername: string;
  registerPassword: string;
  registerTelegram: string;
  message: string;
  onModeChange: (value: "login" | "register") => void;
  onLoginUsernameChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onRegisterUsernameChange: (value: string) => void;
  onRegisterPasswordChange: (value: string) => void;
  onRegisterTelegramChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
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
                <Bitcoin size={17} /> Crediti Bitcoin
              </span>
              <span>
                <Headphones size={17} /> Trasferimento verso SIP/Zoiper
              </span>
            </div>
          </div>

          <form
            className="login-form"
            onSubmit={mode === "login" ? onLogin : onRegister}
          >
            <div className="login-form-heading">
              {mode === "login" ? <UserCheck size={24} /> : <UserPlus size={24} />}
              <div>
                <strong>{mode === "login" ? "Accesso cliente" : "Registrazione"}</strong>
                <span>
                  {mode === "login"
                    ? "Entra con nome utente e password."
                    : "Crea un cliente con contatto Telegram."}
                </span>
              </div>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Accesso">
              <button
                className={mode === "login" ? "active" : ""}
                type="button"
                onClick={() => onModeChange("login")}
              >
                Accedi
              </button>
              <button
                className={mode === "register" ? "active" : ""}
                type="button"
                onClick={() => onModeChange("register")}
              >
                Registrati
              </button>
            </div>

            <label className="field">
              <span>Nome utente</span>
              <div className="input-with-icon">
                <UserCheck size={18} />
                <input
                  type="text"
                  value={mode === "login" ? loginUsername : registerUsername}
                  onChange={(event) =>
                    mode === "login"
                      ? onLoginUsernameChange(event.target.value)
                      : onRegisterUsernameChange(event.target.value)
                  }
                  placeholder="nome_utente"
                  autoComplete="username"
                />
              </div>
            </label>

            <label className="field">
              <span>Password</span>
              <div className="input-with-icon">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={mode === "login" ? loginPassword : registerPassword}
                  onChange={(event) =>
                    mode === "login"
                      ? onLoginPasswordChange(event.target.value)
                      : onRegisterPasswordChange(event.target.value)
                  }
                  placeholder="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </div>
            </label>

            {mode === "register" && (
              <label className="field">
                <span>Contatto Telegram</span>
                <div className="input-with-icon">
                  <MessageCircle size={18} />
                  <input
                    type="text"
                    value={registerTelegram}
                    onChange={(event) =>
                      onRegisterTelegramChange(event.target.value)
                    }
                    placeholder="@tuo_contatto"
                  />
                </div>
              </label>
            )}

            <button className="primary-button full-width" type="submit">
              {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
              {mode === "login" ? "Entra nel pannello" : "Crea account"}
            </button>

            <div className="login-note">
              <LockKeyhole size={16} />
              <span>{message}</span>
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
