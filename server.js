import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
const DEV_SECRET = "orbital-dev-override";


const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.resolve("./users.json");

app.use(cors());
app.use(express.json());

// Ensure users.json exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// Helpers
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Ensure admin profile exists
function ensureAdminExists() {
  const users = readUsers();
  const existing = users.find(u => u.isAdmin === true);

  if (!existing) {
    const admin = {
      id: "ADMIN-0001",
      username: "ADMIN",
      gender: "neutral",
      avatarSeed: "admin-master",
      vibe: "mystic",
      isAdmin: true,
      createdAt: Date.now(),
      lastActive: Date.now()
    };

    users.push(admin);
    writeUsers(users);
    console.log("🛠 Admin profile created automatically");
  }
}

ensureAdminExists();


// Health check
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

// Get all profiles
app.get("/api/users", (_, res) => {
  const users = readUsers();
  const publicUsers = users.filter(u => !u.isAdmin);
  res.json(publicUsers);
});


// Update admin profile (DEV tuning)
app.put("/api/admin", (req, res) => {

  // 🔒 DEV SECRET CHECK
  if (req.headers["x-dev-secret"] !== DEV_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const users = readUsers();
  const index = users.findIndex(u => u.isAdmin === true);

  if (index === -1) {
    return res.status(404).json({ error: "Admin not found" });
  }

  const updates = { ...req.body };

// Remove keys that are explicitly null
Object.keys(updates).forEach(key => {
  if (updates[key] === null) {
    delete users[index][key];
  }
});

// Apply remaining updates
users[index] = {
  ...users[index],
  ...updates,
  lastActive: Date.now()
};


  writeUsers(users);
  res.json(users[index]);
});


// Get admin profile (DEV only use)
app.get("/api/admin", (req, res) => {

  if (req.headers["x-dev-secret"] !== DEV_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const users = readUsers();
  const admin = users.find(u => u.isAdmin === true);

  if (!admin) {
    return res.status(404).json({ error: "Admin not found" });
  }

  res.json(admin);
});


// Create new profile
app.post("/api/users", (req, res) => {
  const { username, gender } = req.body;

const allowedGenders = ["male", "female", "neutral"];

if (gender && !allowedGenders.includes(gender)) {
  return res.status(400).json({ error: "Invalid gender" });
}


  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Invalid username" });
  }

  const users = readUsers();

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "User exists" });
  }

  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    gender: gender || "neutral",
    avatarSeed: `${username}-${gender || "neutral"}`,
    createdAt: Date.now(),
    lastActive: Date.now()
  };

  users.push(user);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  res.json(user);
});


// Login (select profile)
app.post("/api/login", (req, res) => {
  const { username } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

