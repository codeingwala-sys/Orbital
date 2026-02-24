import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";


const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.resolve("./users.json");
const LOGS_FILE = path.resolve("./loginLogs.json");


app.use(cors({
  origin: [
    "https://codeingwala-sys.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));


app.use(express.json());

// Ensure users.json exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

if (!fs.existsSync(LOGS_FILE)) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
}

// Helpers
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function readLogs() {
  return JSON.parse(fs.readFileSync(LOGS_FILE, "utf-8"));
}

function writeLogs(logs) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}


async function ensureDeveloperExists() {
  const users = readUsers();

  const existing = users.find(u => u.role === "developer");

  if (!existing) {
    const hashedPassword = await bcrypt.hash("devpassword123", 10);

    const devUser = {
      id: "DEV-0001",
      username: "developer",
      password: hashedPassword,
      role: "developer",
      gender: "neutral",
      avatarSeed: "dev-master",
      createdAt: Date.now(),
      lastActive: Date.now()
    };

    users.push(devUser);
    writeUsers(users);

    console.log("🛠 Developer account created");
  }
}

ensureDeveloperExists();

// Health check
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});


// Create new profile
app.post("/api/register", async (req, res) => {
  const { username, password, gender, vibe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const users = readUsers();

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "User exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    password: hashedPassword,
    role: "user",
    gender: gender || "neutral",
    vibe: vibe || "calm",
    firstLoginCompleted: false,
    avatarSeed: `${username}-${gender || "neutral"}`,
    createdAt: Date.now(),
    lastActive: Date.now()
  };

  users.push(user);
  writeUsers(users);

  res.json({ message: "Registered successfully" });
});


// Login (select profile)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const users = readUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: "Invalid credentials" });
  }


  // ===== LOGIN LOGGING =====

const logs = readLogs();

const newLog = {
  username: user.username,
  role: user.role,
  ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
  userAgent: req.headers["user-agent"],
  timestamp: new Date().toISOString()
};

// Add newest at top
logs.unshift(newLog);

// Optional: limit to last 500 entries
if (logs.length > 500) {
  logs.pop();
}

writeLogs(logs);


  const token = jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ token, role: user.role });
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Unauthorized" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/me", authMiddleware, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // ===== SESSION ENTRY LOGGING =====
const logs = readLogs();
const now = Date.now();

const lastUserLog = logs.find(l => l.username === user.username);

let shouldLog = true;

if (lastUserLog) {
  const lastTime = new Date(lastUserLog.timestamp).getTime();
  if (now - lastTime < 5 * 60 * 1000) { // 5 minutes
    shouldLog = false;
  }
}

if (shouldLog) {
  logs.unshift({
    username: user.username,
    role: user.role,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
    timestamp: new Date().toISOString(),
    type: "session-access"
  });

  if (logs.length > 500) logs.pop();
  writeLogs(logs);
}

let showIntro = false;

if (!user.firstLoginCompleted) {
  showIntro = true;
  user.firstLoginCompleted = true;
  writeUsers(users);
}

const { password, ...safeUser } = user;
res.json({ ...safeUser, showIntro });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

