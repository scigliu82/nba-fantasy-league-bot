# 🚀 Setup Guide - NBA Fantasy League Bot

Complete step-by-step guide to get your bot running.

---

## 📋 Prerequisites

Before starting, make sure you have:

- ✅ Node.js 18 or higher installed
- ✅ A Discord account
- ✅ Basic command line knowledge
- ✅ A Firebase account (free tier is enough)

---

## 1️⃣ Clone Repository
```bash
git clone https://github.com/scigliu82/nba-fantasy-league-bot.git
cd nba-fantasy-league-bot
```

---

## 2️⃣ Install Dependencies
```bash
npm install
```

This will install all required packages from `package.json`.

---

## 3️⃣ Create Discord Bot

### Step 1: Create Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name it: `NBA Fantasy League Bot`
4. Click **"Create"**

### Step 2: Create Bot

1. Go to **"Bot"** tab (left sidebar)
2. Click **"Add Bot"** → Confirm
3. Under **Token**, click **"Reset Token"** → Copy and save it
4. Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent

### Step 3: Get IDs

1. Go to **"OAuth2"** → **"General"**
2. Copy **Client ID** (you'll need this)

### Step 4: Invite Bot to Server

1. Go to **"OAuth2"** → **"URL Generator"**
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ Manage Roles
   - ✅ Manage Channels
   - ✅ Send Messages
   - ✅ Manage Messages
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Use Slash Commands
4. Copy the generated URL
5. Paste in browser and invite to your server

---

## 4️⃣ Setup Firebase

### Step 1: Create Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"**
3. Name: `nba-fantasy-league`
4. Disable Google Analytics (not needed)
5. Click **"Create project"**

### Step 2: Enable Firestore

1. In Firebase console, go to **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"**
4. Choose location closest to you
5. Click **"Enable"**

### Step 3: Get Service Account

1. Go to **"Project Settings"** (gear icon top-left)
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"** → Downloads JSON file
5. Rename file to `firebase-service-account.json`
6. Move file to `config/` folder in your project

**⚠️ IMPORTANT:** Never commit this file to Git! It's already in `.gitignore`.

---

## 5️⃣ Configure Environment

### Step 1: Copy Template
```bash
cp .env.example .env
```

### Step 2: Fill .env File

Open `.env` and fill in your values:
```env
# Discord
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_server_id_here

# Firebase (if using JSON file, you can leave these empty)
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json

# Admin
ADMIN_USER_IDS=your_discord_user_id

# Season (defaults are fine for now)
CURRENT_SEASON=2025-26
SALARY_CAP=159200000
LUXURY_TAX=188931000
FIRST_APRON=195945000
SECOND_APRON=207824000
```

**How to get your Discord User ID:**
1. Enable Developer Mode: Settings → Advanced → Developer Mode
2. Right-click your name → Copy ID

**How to get Server ID:**
1. Right-click your server icon → Copy ID

---

## 6️⃣ Prepare Roster Data

### Option A: Use Example (for testing)
```bash
# Copy example file
cp data/roster.example.csv data/roster.csv
```

This has only ~12 players for quick testing.

### Option B: Prepare Full Roster

Create `data/roster.csv` with all 487 players following this format:
```csv
Nome,Team,Posizione,Età,Overall,Esperienza,Loyalty,Money_Importance,Win_Desire,2025-26,2026-27,2027-28,2028-29,2029-30,2030-31,Option_Type,Option_Year,Bird_Rights,Contract_Type
LeBron James,Los Angeles Lakers,SF,40,90,21,50,40,95,48728845,52627153,UFA,UFA,UFA,UFA,PO,2,3,STANDARD
...
```

---

## 7️⃣ Import Roster
```bash
npm run import-roster
```

This will:
- ✅ Parse your CSV file
- ✅ Create all 30 teams in database
- ✅ Create all players with contracts
- ✅ Initialize season data

**Expected output:**
```
═══════════════════════════════════════════════════════
🏀 NBA FANTASY LEAGUE - ROSTER IMPORT
═══════════════════════════════════════════════════════

📊 Connecting to database...
✅ Database connected

📄 Reading CSV file...
✅ Parsed 12 rows

🔍 Processing rows...
✅ Processed 12 players
✅ Processed 3 teams

📤 Importing to database...
✅ Imported 3 teams
✅ Imported 12 players
✅ Season initialized

═══════════════════════════════════════════════════════
✅ IMPORT COMPLETED SUCCESSFULLY!
═══════════════════════════════════════════════════════
```

---

## 8️⃣ Deploy Commands

Register slash commands with Discord:
```bash
npm run deploy-commands
```

**Expected output:**
```
✅ Loaded: roster
🚀 Started refreshing 1 application (/) commands.
✅ Successfully reloaded 1 guild commands.
```

---

## 9️⃣ Start Bot

### Development Mode (auto-restart on changes)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

**Expected output:**
```
═══════════════════════════════════════════════════════
✅ Bot ready! Logged in as NBA Fantasy League Bot#1234
📊 Serving 1 server(s)
👥 10 total users
═══════════════════════════════════════════════════════

📋 Loaded 1 commands:
   • /roster
```

---

## 🎉 Test the Bot

In your Discord server, try:
```
/roster lakers
```

You should see the Lakers roster!

---

## 🔧 Troubleshooting

### Bot not responding

1. **Check bot is online** - You should see green dot next to bot name
2. **Check permissions** - Bot needs all permissions from step 3
3. **Check .env file** - Make sure all values are correct
4. **Redeploy commands** - Run `npm run deploy-commands` again

### Import failed

1. **Check CSV format** - Must match example exactly
2. **Check Firebase connection** - Verify service account JSON is correct
3. **Check node_modules** - Run `npm install` again

### Commands not showing up

1. **Wait a few minutes** - Discord can take time to register commands
2. **Try redeploying** - `npm run deploy-commands`
3. **Check GUILD_ID** - Make sure it's correct in .env

---

## 📚 Next Steps

Now that your bot is running with basic roster command:

1. **Add more commands** - Follow the pattern in `src/commands/info/roster.js`
2. **Assign GMs** - Manually in Firebase for now
3. **Add trade system** - Follow the master documentation
4. **Add free agency** - Follow the master documentation

Check the [full documentation](NBA_Discord_Bot_Master_Complete_v3.md) for all features!

---

## 🆘 Need Help?

- Open an issue on GitHub
- Check logs in console for error messages
- Review Firebase console for database issues

---

**You're ready to go! 🏀🚀**