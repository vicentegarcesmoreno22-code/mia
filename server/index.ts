import "dotenv/config";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import cors from "cors";
import express from "express";
import { mkdirSync } from "node:fs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  telegram: string;
  role: "client" | "admin";
  created_at: string;
};

type AuthUser = {
  id: number;
  username: string;
  telegram: string;
  role: "client" | "admin";
};

type CampaignRow = {
  id: string;
  name: string;
  status: "Pronta" | "In pausa" | "Completata";
  progress: number;
  pressed: number;
  total: number;
  sip: string;
  ivr: string;
  numbers_json: string;
  created_at: string;
};

type SipAccountRow = {
  id: string;
  name: string;
  username: string;
  password: string;
  status: "online" | "offline";
  created_at: string;
};

type InvoiceRow = {
  id: string;
  amount_btc: string;
  credit_amount_cents: number;
  btc_address: string;
  status: "pending" | "paid";
  created_at: string;
  paid_at: string | null;
};

type QueueCampaignRow = CampaignRow & {
  user_id: number;
  client_username: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const dataDirectory = process.env.DATA_DIR ?? join(projectRoot, "data");
const databasePath = process.env.DATABASE_PATH ?? join(dataDirectory, "mia.sqlite");
const jwtSecret =
  process.env.AUTH_TOKEN_SECRET ?? "dev-secret-change-me-before-production";
const btcReceiveAddress = process.env.BTC_RECEIVE_ADDRESS ?? "";
const bitcoinWebhookSecret = process.env.BITCOIN_WEBHOOK_SECRET ?? "";
const adminUsername = process.env.ADMIN_USERNAME?.trim() ?? "";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const adminTelegram = process.env.ADMIN_TELEGRAM?.trim() || "@admin";
const port = Number(process.env.API_PORT ?? 4000);

mkdirSync(dataDirectory, { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    telegram TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    pressed INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    sip TEXT NOT NULL,
    ivr TEXT NOT NULL,
    numbers_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sip_accounts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bitcoin_invoices (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    amount_btc TEXT NOT NULL,
    credit_amount_cents INTEGER NOT NULL DEFAULT 0,
    btc_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as {
    name: string;
  }[];

  if (!columns.some((column) => column.name === columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

ensureColumn("bitcoin_invoices", "credit_amount_cents", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("bitcoin_invoices", "paid_at", "TEXT");

const userSelect = db.prepare("SELECT * FROM users WHERE username = ?");
const userByIdSelect = db.prepare("SELECT * FROM users WHERE id = ?");
const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, telegram, role)
  VALUES (@username, @passwordHash, @telegram, @role)
`);

function ensureWallet(userId: number) {
  db.prepare(
    `INSERT OR IGNORE INTO wallets (user_id, balance_cents, updated_at)
     VALUES (?, 0, ?)`
  ).run(userId, new Date().toISOString());
}

function walletForUser(userId: number) {
  ensureWallet(userId);
  return db
    .prepare("SELECT balance_cents FROM wallets WHERE user_id = ?")
    .get(userId) as { balance_cents: number };
}

function formatCredits(cents: number) {
  return (cents / 100).toFixed(2);
}

function bootstrapAdminFromEnv() {
  if (!adminUsername || !adminPassword) {
    return;
  }

  const existingUser = userSelect.get(adminUsername) as UserRow | undefined;
  if (existingUser) {
    if (existingUser.role !== "admin") {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingUser.id);
    }
    ensureWallet(existingUser.id);
    return;
  }

  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  const result = insertUser.run({
    username: adminUsername,
    passwordHash,
    telegram: adminTelegram,
    role: "admin",
  });

  ensureWallet(Number(result.lastInsertRowid));
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function publicUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    username: user.username,
    telegram: user.telegram,
    role: user.role,
  };
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", jwtSecret).update(payload).digest("base64url");
}

function createToken(user: AuthUser) {
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 1000 * 60 * 60 * 24,
    })
  );

  return `${payload}.${signPayload(payload)}`;
}

function verifyToken(token: string): AuthUser | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub: number;
    exp: number;
  };

  if (decoded.exp < Date.now()) {
    return null;
  }

  const user = userByIdSelect.get(decoded.sub) as UserRow | undefined;
  return user ? publicUser(user) : null;
}

const authSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username troppo corto")
    .max(32, "Username troppo lungo")
    .regex(/^[a-zA-Z0-9_]+$/, "Usa solo lettere, numeri e underscore"),
  password: z.string().min(6, "Password troppo corta").max(128),
});

const registerSchema = authSchema.extend({
  telegram: z.string().trim().min(3, "Inserisci il contatto Telegram").max(64),
});

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  total: z.number().int().min(1).max(50000),
  sip: z.string().trim().min(1).max(120),
  ivr: z.string().trim().min(1).max(120),
  numbers: z.array(z.string().trim().min(3)).max(50000).default([]),
});

const sipSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(80),
  password: z.string().trim().min(6).max(128),
});

const invoiceSchema = z.object({
  amountBtc: z.string().trim().regex(/^\d+(\.\d{1,8})?$/, "Importo BTC non valido"),
  creditAmount: z
    .number()
    .min(1, "Importo crediti troppo basso")
    .max(100000, "Importo crediti troppo alto"),
});
const bitcoinPaidStatuses = new Set([
  "paid",
  "settled",
  "confirmed",
  "complete",
  "completed",
]);

const webhookSchema = z.object({
  invoiceId: z.string().trim().min(3),
  status: z.string().trim().min(2),
});
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
app.use(express.json({ limit: "2mb" }));

function getAuthUser(request: express.Request): AuthUser | null {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return token ? verifyToken(token) : null;
}

function requireAuth(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
) {
  const user = getAuthUser(request);
  if (!user) {
    response.status(401).json({ error: "Non autorizzato" });
    return;
  }

  response.locals.user = user;
  next();
}

function requireAdmin(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
) {
  const user = getAuthUser(request);
  if (!user) {
    response.status(401).json({ error: "Non autorizzato" });
    return;
  }

  if (user.role !== "admin") {
    response.status(403).json({ error: "Solo admin" });
    return;
  }

  response.locals.user = user;
  next();
}

bootstrapAdminFromEnv();

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    database: databasePath,
  });
});

app.post("/api/auth/register", (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }

  const existingUser = userSelect.get(parsed.data.username) as UserRow | undefined;
  if (existingUser) {
    response.status(409).json({ error: "Username gia registrato" });
    return;
  }

  const passwordHash = bcrypt.hashSync(parsed.data.password, 12);
  const result = insertUser.run({
    username: parsed.data.username,
    passwordHash,
    telegram: parsed.data.telegram,
    role: "client",
  });

  const user = userByIdSelect.get(result.lastInsertRowid) as UserRow;
  ensureWallet(user.id);
  const authUser = publicUser(user);

  response.status(201).json({
    token: createToken(authUser),
    user: authUser,
  });
});

app.post("/api/auth/login", (request, response) => {
  const parsed = authSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }

  const user = userSelect.get(parsed.data.username) as UserRow | undefined;
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    response.status(401).json({ error: "Username o password non corretti" });
    return;
  }

  ensureWallet(user.id);
  const authUser = publicUser(user);
  response.json({
    token: createToken(authUser),
    user: authUser,
  });
});

app.get("/api/me", requireAuth, (_request, response) => {
  response.json({ user: response.locals.user as AuthUser });
});

app.get("/api/wallet", requireAuth, (_request, response) => {
  const user = response.locals.user as AuthUser;
  const wallet = walletForUser(user.id);

  response.json({
    wallet: {
      balanceCredits: formatCredits(wallet.balance_cents),
      balanceCents: wallet.balance_cents,
    },
  });
});

app.get("/api/admin/overview", requireAdmin, (_request, response) => {
  const clients = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'client'")
    .get() as { count: number };
  const campaigns = db
    .prepare("SELECT COUNT(*) AS count FROM campaigns")
    .get() as { count: number };
  const readyCampaigns = db
    .prepare("SELECT COUNT(*) AS count FROM campaigns WHERE status = 'Pronta'")
    .get() as { count: number };
  const wallets = db
    .prepare("SELECT COALESCE(SUM(balance_cents), 0) AS total FROM wallets")
    .get() as { total: number };

  response.json({
    overview: {
      clients: clients.count,
      campaigns: campaigns.count,
      readyCampaigns: readyCampaigns.count,
      totalWalletCredits: formatCredits(wallets.total),
    },
  });
});

app.get("/api/admin/call-queue", requireAdmin, (request, response) => {
  const limit = Math.min(
    Math.max(Number(request.query.limit ?? 32), 1),
    32
  );

  const campaigns = db
    .prepare(
      `SELECT
        campaigns.id,
        campaigns.user_id,
        campaigns.name,
        campaigns.status,
        campaigns.progress,
        campaigns.pressed,
        campaigns.total,
        campaigns.sip,
        campaigns.ivr,
        campaigns.numbers_json,
        campaigns.created_at,
        users.username AS client_username
       FROM campaigns
       INNER JOIN users ON users.id = campaigns.user_id
       WHERE campaigns.status = 'Pronta'
       ORDER BY campaigns.created_at ASC`
    )
    .all() as QueueCampaignRow[];

  const pools = campaigns
    .map((campaign) => {
      try {
        const numbers = JSON.parse(campaign.numbers_json) as string[];
        return {
          campaign,
          numbers: shuffle(numbers),
        };
      } catch {
        return {
          campaign,
          numbers: [],
        };
      }
    })
    .filter((pool) => pool.numbers.length > 0);

  const queue = [];
  const activePools = [...pools];

  while (queue.length < limit && activePools.length > 0) {
    const poolIndex = Math.floor(Math.random() * activePools.length);
    const pool = activePools[poolIndex];
    const number = pool.numbers.shift();

    if (number) {
      queue.push({
        number,
        client: pool.campaign.client_username,
        campaignId: pool.campaign.id,
        campaignName: pool.campaign.name,
        sip: pool.campaign.sip,
        ivr: pool.campaign.ivr,
      });
    }

    if (pool.numbers.length === 0) {
      activePools.splice(poolIndex, 1);
    }
  }

  response.json({
    queue,
    availableCampaigns: pools.length,
    limit,
  });
});

app.get("/api/campaigns", requireAuth, (_request, response) => {
  const user = response.locals.user as AuthUser;
  const campaigns = db
    .prepare(
      `SELECT id, name, status, progress, pressed, total, sip, ivr, numbers_json, created_at
       FROM campaigns
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(user.id) as CampaignRow[];

  response.json({
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      progress: campaign.progress,
      pressed: campaign.pressed,
      total: campaign.total,
      sip: campaign.sip,
      ivr: campaign.ivr,
      createdAt: campaign.created_at,
    })),
  });
});

app.post("/api/campaigns", requireAuth, (request, response) => {
  const parsed = campaignSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }

  const user = response.locals.user as AuthUser;
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO campaigns
      (id, user_id, name, status, progress, pressed, total, sip, ivr, numbers_json, created_at)
     VALUES
      (@id, @userId, @name, 'Pronta', 0, 0, @total, @sip, @ivr, @numbersJson, @createdAt)`
  ).run({
    id,
    userId: user.id,
    name: parsed.data.name,
    total: parsed.data.total,
    sip: parsed.data.sip,
    ivr: parsed.data.ivr,
    numbersJson: JSON.stringify(parsed.data.numbers),
    createdAt,
  });

  response.status(201).json({
    campaign: {
      id,
      name: parsed.data.name,
      status: "Pronta",
      progress: 0,
      pressed: 0,
      total: parsed.data.total,
      sip: parsed.data.sip,
      ivr: parsed.data.ivr,
      createdAt,
    },
  });
});

app.get("/api/sip-accounts", requireAuth, (_request, response) => {
  const user = response.locals.user as AuthUser;
  const accounts = db
    .prepare(
      `SELECT id, name, username, password, status, created_at
       FROM sip_accounts
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(user.id) as SipAccountRow[];

  response.json({ accounts });
});

app.post("/api/sip-accounts", requireAuth, (request, response) => {
  const parsed = sipSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }

  const user = response.locals.user as AuthUser;
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO sip_accounts (id, user_id, name, username, password, status, created_at)
     VALUES (@id, @userId, @name, @username, @password, 'offline', @createdAt)`
  ).run({
    id,
    userId: user.id,
    name: parsed.data.name,
    username: parsed.data.username,
    password: parsed.data.password,
    createdAt,
  });

  response.status(201).json({
    account: {
      id,
      name: parsed.data.name,
      username: parsed.data.username,
      password: parsed.data.password,
      status: "offline",
      created_at: createdAt,
    },
  });
});

app.get("/api/invoices", requireAuth, (_request, response) => {
  const user = response.locals.user as AuthUser;
  const invoices = db
    .prepare(
      `SELECT id, amount_btc, credit_amount_cents, btc_address, status, created_at, paid_at
       FROM bitcoin_invoices
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(user.id) as InvoiceRow[];

  response.json({
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      amountBtc: invoice.amount_btc,
      creditAmount: formatCredits(invoice.credit_amount_cents),
      btcAddress: invoice.btc_address,
      status: invoice.status,
      createdAt: invoice.created_at,
      paidAt: invoice.paid_at,
    })),
  });
});

app.post("/api/invoices", requireAuth, (request, response) => {
  const parsed = invoiceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }

  if (!btcReceiveAddress) {
    response.status(409).json({
      error: "Configura BTC_RECEIVE_ADDRESS nel file .env prima di generare fatture",
    });
    return;
  }

  const user = response.locals.user as AuthUser;
  const id = `BTC-${randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const creditAmountCents = Math.round(parsed.data.creditAmount * 100);

  db.prepare(
    `INSERT INTO bitcoin_invoices
      (id, user_id, amount_btc, credit_amount_cents, btc_address, status, created_at)
     VALUES
      (@id, @userId, @amountBtc, @creditAmountCents, @btcAddress, 'pending', @createdAt)`
  ).run({
    id,
    userId: user.id,
    amountBtc: parsed.data.amountBtc,
    creditAmountCents,
    btcAddress: btcReceiveAddress,
    createdAt,
  });

  response.status(201).json({
    invoice: {
      id,
      amountBtc: parsed.data.amountBtc,
      creditAmount: formatCredits(creditAmountCents),
      btcAddress: btcReceiveAddress,
      status: "pending",
      createdAt,
      paidAt: null,
    },
  });
});

app.post("/api/webhooks/bitcoin", (request, response) => {
  if (bitcoinWebhookSecret) {
    const providedSecret = request.header("x-webhook-secret") ?? "";
    if (providedSecret !== bitcoinWebhookSecret) {
      response.status(401).json({ error: "Webhook non autorizzato" });
      return;
    }
  }

  const parsed = webhookSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }

  const normalizedStatus = parsed.data.status.toLowerCase();
  if (!bitcoinPaidStatuses.has(normalizedStatus)) {
    response.json({ ok: true, credited: false, reason: "Pagamento non confermato" });
    return;
  }

  const invoice = db
    .prepare(
      `SELECT id, user_id, amount_btc, credit_amount_cents, btc_address, status, created_at, paid_at
       FROM bitcoin_invoices
       WHERE id = ?`
    )
    .get(parsed.data.invoiceId) as (InvoiceRow & { user_id: number }) | undefined;

  if (!invoice) {
    response.status(404).json({ error: "Fattura non trovata" });
    return;
  }

  if (invoice.status === "paid") {
    response.json({ ok: true, credited: false, reason: "Fattura gia pagata" });
    return;
  }

  const paidAt = new Date().toISOString();
  const creditInvoice = db.transaction(() => {
    db.prepare(
      `UPDATE bitcoin_invoices
       SET status = 'paid', paid_at = ?
       WHERE id = ? AND status = 'pending'`
    ).run(paidAt, invoice.id);

    ensureWallet(invoice.user_id);
    db.prepare(
      `UPDATE wallets
       SET balance_cents = balance_cents + ?, updated_at = ?
       WHERE user_id = ?`
    ).run(invoice.credit_amount_cents, paidAt, invoice.user_id);

    return walletForUser(invoice.user_id);
  });

  const wallet = creditInvoice();

  response.json({
    ok: true,
    credited: true,
    invoiceId: invoice.id,
    creditedCredits: formatCredits(invoice.credit_amount_cents),
    balanceCredits: formatCredits(wallet.balance_cents),
  });
});

app.listen(port, () => {
  console.log(`MIA IVR API listening on http://localhost:${port}`);
});
