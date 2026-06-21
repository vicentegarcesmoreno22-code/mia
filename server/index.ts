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

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const dataDirectory = process.env.DATA_DIR ?? join(projectRoot, "data");
const databasePath = process.env.DATABASE_PATH ?? join(dataDirectory, "mia.sqlite");
const jwtSecret =
  process.env.AUTH_TOKEN_SECRET ?? "dev-secret-change-me-before-production";
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
`);

const userSelect = db.prepare("SELECT * FROM users WHERE username = ?");
const userByIdSelect = db.prepare("SELECT * FROM users WHERE id = ?");
const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, telegram, role)
  VALUES (@username, @passwordHash, @telegram, @role)
`);

function seedDemoUser() {
  const existingUser = userSelect.get("cliente_demo") as UserRow | undefined;
  if (existingUser) {
    seedDefaultSipAccounts(existingUser.id);
    seedDefaultCampaigns(existingUser.id);
    return existingUser;
  }

  const passwordHash = bcrypt.hashSync("demo1234", 12);
  const result = insertUser.run({
    username: "cliente_demo",
    passwordHash,
    telegram: "@cliente_demo",
    role: "client",
  });

  const user = userByIdSelect.get(result.lastInsertRowid) as UserRow;
  seedDefaultSipAccounts(user.id);
  seedDefaultCampaigns(user.id);
  return user;
}

function seedDefaultSipAccounts(userId: number) {
  const existingCount = db
    .prepare("SELECT COUNT(*) AS count FROM sip_accounts WHERE user_id = ?")
    .get(userId) as { count: number };

  if (existingCount.count > 0) {
    return;
  }

  const insertSip = db.prepare(`
    INSERT INTO sip_accounts (id, user_id, name, username, password, status)
    VALUES (@id, @userId, @name, @username, @password, @status)
  `);

  insertSip.run({
    id: randomUUID(),
    userId,
    name: "Operatore Milano",
    username: "cliente01-milano",
    password: "zoiper-demo-92K",
    status: "online",
  });

  insertSip.run({
    id: randomUUID(),
    userId,
    name: "Operatore Roma",
    username: "cliente01-roma",
    password: "zoiper-demo-41Q",
    status: "offline",
  });
}

function seedDefaultCampaigns(userId: number) {
  const existingCount = db
    .prepare("SELECT COUNT(*) AS count FROM campaigns WHERE user_id = ?")
    .get(userId) as { count: number };

  if (existingCount.count > 0) {
    return;
  }

  const insertCampaign = db.prepare(`
    INSERT INTO campaigns
      (id, user_id, name, status, progress, pressed, total, sip, ivr, numbers_json, created_at)
    VALUES
      (@id, @userId, @name, @status, @progress, @pressed, @total, @sip, @ivr, @numbersJson, @createdAt)
  `);

  [
    {
      name: "Promo Energia",
      status: "In pausa",
      progress: 62,
      pressed: 148,
      total: 1200,
      sip: "cliente01-milano",
      ivr: "promo-energia.wav",
    },
    {
      name: "Recall Lead Caldi",
      status: "Pronta",
      progress: 0,
      pressed: 0,
      total: 430,
      sip: "cliente01-roma",
      ivr: "tts-richiamata",
    },
    {
      name: "Servizi Business",
      status: "Completata",
      progress: 100,
      pressed: 391,
      total: 2600,
      sip: "cliente01-milano",
      ivr: "business.mp3",
    },
  ].forEach((campaign, index) => {
    insertCampaign.run({
      id: randomUUID(),
      userId,
      ...campaign,
      numbersJson: "[]",
      createdAt: new Date(Date.now() - index * 3600000).toISOString(),
    });
  });
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

seedDemoUser();

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
  seedDefaultSipAccounts(user.id);
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

  const authUser = publicUser(user);
  response.json({
    token: createToken(authUser),
    user: authUser,
  });
});

app.get("/api/me", requireAuth, (_request, response) => {
  response.json({ user: response.locals.user as AuthUser });
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

app.listen(port, () => {
  console.log(`MIA IVR API listening on http://localhost:${port}`);
});
