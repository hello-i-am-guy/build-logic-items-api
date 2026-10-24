const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURATION & SECRETS (Set these in Render)
// ==========================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "your-actual-email@gmail.com"; 
const SESSION_SECRET = process.env.SESSION_SECRET || "super-secret-random-string";

// Base URL for callback (e.g., https://blosr.onrender.com or http://localhost:3000)
const CALLBACK_URL = process.env.CALLBACK_URL || "http://localhost:3000/auth/google/callback";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Google OAuth Setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "YOUR_GOOGLE_CLIENT_SECRET",
    callbackURL: CALLBACK_URL
  },
  (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ==========================================
// IN-MEMORY DATABASES
// ==========================================
const panelQueues = {}; // { panelNum: [ "00000000", ... ] }
const bannedUsers = new Set(); // Stores banned Google emails/IDs
const typingLogs = []; // Stores recent typing activity history

// Bad word list for anti-swear filter
const badWords = ["badword1", "badword2", "damn", "hell", "crap"]; // Add your words here

function filterSwears(text) {
  let cleaned = text;
  badWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    cleaned = cleaned.replace(regex, '***');
  });
  return cleaned;
}

// Middleware to check if user is logged in
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/google');
}

// Middleware to check if user is specifically YOU (the real admin)
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.emails && req.user.emails[0].value.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return next();
  }
  res.status(403).send(`
    <html><body style="background:#0f172a; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
      <h1 style="color:#ef4444;">Access Denied</h1>
      <p>This area is strictly restricted to the owner's Google account (${ADMIN_EMAIL}). You cannot bypass this.</p>
      <a href="/typewriter/menu" style="color:#38bdf8;">Back to Menu</a>
    </body></html>
  `);
}

// ==========================================
// AUTH ROUTES
// ==========================================
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/typewriter/menu');
  }
);

app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// ==========================================
// MAIN LANDING & MENU
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Typewriter Home</title></head>
    <body style="font-family:'Segoe UI',sans-serif; background:#0f172a; color:#f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
      <div style="background:#1e293b; padding:40px; border-radius:12px; text-align:center; border:1px solid #334155;">
        <h1>HTTP Typewriter API</h1>
        <a href="/typewriter/menu" style="display:inline-block; padding:12px 24px; background:#0284c7; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">Enter Dashboard</a>
      </div>
    </body>
    </html>
  `);
});

app.get('/typewriter/menu', ensureAuthenticated, (req, res) => {
  const userEmail = req.user.emails[0].value;
  const isOwner = userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>HTTP Typewriter Control</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; margin: 0; }
        .container { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 100%; max-width: 480px; border: 1px solid #334155; }
        h2 { color: #38bdf8; margin-top: 0; text-align: center; }
        label { display: block; margin-top: 15px; font-weight: 600; font-size: 14px; color: #94a3b8; }
        input, textarea { width: 100%; padding: 10px; margin-top: 6px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; box-sizing: border-box; font-size: 14px; }
        textarea { height: 80px; resize: vertical; }
        button { width: 100%; padding: 12px; margin-top: 20px; background: #10b981; border: none; color: white; font-weight: bold; border-radius: 6px; cursor: pointer; }
        button:hover { background: #059669; }
        .user-info { font-size: 13px; color: #94a3b8; margin-bottom: 20px; text-align: center; }
        .admin-badge { background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .admin-link { display: block; margin-top: 20px; text-align: center; background: #7c3aed; color: #fff; padding: 10px; border-radius: 6px; text-decoration: none; font-weight: bold; }
        .admin-link:hover { background: #6d28d9; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>HTTP Typewriter</h2>
        <div class="user-info">
          Logged in as: <b>${userEmail}</b> ${isOwner ? '<span class="admin-badge">OWNER</span>' : ''} 
          <br><a href="/logout" style="color: #ef4444; font-size: 12px;">Logout</a>
        </div>

        <label>Header [panel: (number here)]:</label>
        <input type="number" id="panelNumber" placeholder="e.g. 1" required />
        
        <label>Text to Show in Text Panel:</label>
        <textarea id="textInput" placeholder="Enter text to transmit... (Swears are auto-filtered)"></textarea>
        
        <button onclick="queueText()">Transmit</button>
        <div id="status" style="margin-top: 15px; text-align: center; font-size: 14px;"></div>

        ${isOwner ? '<a href="/admin/dashboard" class="admin-link">🔒 Open Owner Admin Panel</a>' : ''}
      </div>

      <script>
        async function queueText() {
          const panel = document.getElementById('panelNumber').value;
          const text = document.getElementById('textInput').value;
          const status = document.getElementById('status');

          if (!panel) {
            status.style.color = '#ef4444';
            status.innerText = "Please enter a panel number.";
            return;
          }

          const res = await fetch('/typewriter/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ panel, text })
          });

          const data = await res.json();
          if (!res.ok) {
            status.style.color = '#ef4444';
            status.innerText = data.error;
          } else {
            status.style.color = '#10b981';
            status.innerText = data.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// ==========================================
// QUEUE & ANTI-SWEAR ENDPOINT
// ==========================================
app.post('/typewriter/queue', ensureAuthenticated, (req, res) => {
  const userEmail = req.user.emails[0].value;

  // Check if user is banned
  if (bannedUsers.has(userEmail)) {
    return res.status(403).json({ error: "You are banned from using this typewriter." });
  }

  const { panel, text } = req.body;
  if (!panel) return res.status(400).json({ error: "Missing panel number" });

  // Apply Anti-Swear Filter
  const cleanText = filterSwears(text || "");

  // Log typing activity
  typingLogs.unshift({
    email: userEmail,
    panel: panel,
    text: cleanText,
    timestamp: new Date().toLocaleTimeString()
  });
  if (typingLogs.length > 50) typingLogs.pop(); // Keep last 50 logs

  const panelStr = String(panel);
  if (!panelQueues[panelStr]) panelQueues[panelStr] = [];

  // Character bit mapping logic
  for (let char of cleanText) {
    const isUpper = char >= 'A' && char <= 'Z';
    const shiftBit = isUpper ? '1' : '0';
    
    // Simple 6-bit translation code map fallback
    let code = char.toLowerCase().charCodeAt(0) - 96;
    if (code < 1 || code > 26) code = 63; // blank/default if invalid symbol
    const sixBits = code.toString(2).padStart(6, '0');
    
    panelQueues[panelStr].push(`${shiftBit}${sixBits}0`);
    panelQueues[panelStr].push("00000000"); // buffer gap frame
  }

  res.json({ message: `Transmitted successfully! (Swears filtered if any)` });
});

// ==========================================
// REAL OWNER ADMIN PANEL DASHBOARD
// ==========================================
app.get('/admin/dashboard', ensureAdmin, (req, res) => {
  const bannedArray = Array.from(bannedUsers);

  let logsHtml = typingLogs.map(log => `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #334155;">${log.timestamp}</td>
      <td style="padding:8px; border-bottom:1px solid #334155; color:#38bdf8;">${log.email}</td>
      <td style="padding:8px; border-bottom:1px solid #334155;">Panel ${log.panel}</td>
      <td style="padding:8px; border-bottom:1px solid #334155; word-break:break-all;">${log.text}</td>
    </tr>
  `).join('');

  let bannedHtml = bannedArray.map(email => `
    <li style="margin-bottom:8px;">
      ${email} 
      <form action="/admin/unban" method="POST" style="display:inline;">
        <input type="hidden" name="email" value="${email}">
        <button type="submit" style="background:#10b981; padding:2px 8px; border:none; color:#fff; border-radius:4px; cursor:pointer;">Unban</button>
      </form>
    </li>
  `).join('') || '<li>No banned users.</li>';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Owner Admin Dashboard</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
        .box { background: #1e293b; padding: 25px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #334155; }
        h2 { color: #ef4444; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { text-align: left; padding: 8px; background: #334155; }
        input[type="email"] { padding: 8px; width: 300px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 4px; }
        button { background: #ef4444; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        button:hover { background: #dc2626; }
        a { color: #38bdf8; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>🔒 Secure Owner Admin Panel</h1>
      <p>Logged in as Verified Owner: <b>${ADMIN_EMAIL}</b> | <a href="/typewriter/menu">← Back to Menu</a></p>

      <div class="box">
        <h2>Ban Google Account</h2>
        <form action="/admin/ban" method="POST">
          <input type="email" name="email" placeholder="user@gmail.com" required />
          <button type="submit">Ban User</button>
        </form>
        <h3>Currently Banned Users:</h3>
        <ul>${bannedHtml}</ul>
      </div>

      <div class="box">
        <h2>Live Typing Logs</h2>
        <table>
          <thead>
            <tr><th>Time</th><th>Google Account</th><th>Target</th><th>Typed Text (Filtered)</th></tr>
          </thead>
          <tbody>
            ${logsHtml || '<tr><td colspan="4" style="padding:10px; text-align:center;">No typing activity recorded yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});

app.post('/admin/ban', ensureAdmin, (req, res) => {
  const { email } = req.body;
  if (email && email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    bannedUsers.add(email.toLowerCase());
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/unban', ensureAdmin, (req, res) => {
  const { email } = req.body;
  if (email) {
    bannedUsers.delete(email.toLowerCase());
  }
  res.redirect('/admin/dashboard');
});

// ==========================================
// HTTP TRANSMITTER READ ENDPOINT
// ==========================================
app.get('/typewriter/read', (req, res) => {
  const panelHeader = req.headers['panel'];
  if (!panelHeader) {
    return res.status(400).json({ error: "Missing required header 'panel: (number here)'" });
  }

  const panelStr = String(panelHeader).trim();
  if (panelQueues[panelStr] && panelQueues[panelStr].length > 0) {
    return res.json({ value: panelQueues[panelStr].shift() });
  }

  return res.json({ value: "00000000" });
});

app.listen(PORT, () => {
  console.log(`Server running securely on port ${PORT}`);
});
