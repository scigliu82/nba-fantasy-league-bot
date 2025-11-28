# 🏀 NBA Fantasy League Discord Bot

Complete NBA Fantasy League management system for Discord with full CBA rules implementation.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)

---

## 🎯 Features

### ✅ Core System
- 30 NBA teams with private team channels
- 487 players with contracts (2025-2031)
- Automatic Discord server setup
- CSV roster import
- Multi-season support

### 🔄 Trade System
- Multi-team trades (2-4 teams)
- Full CBA validation (salary matching, aprons, aggregation)
- TPE (Traded Player Exceptions)
- Sign & Trade
- Draft picks with protections
- Trade deadline system

### 👥 Free Agency
- Journey-based system (48h rounds)
- Advanced interest algorithm
- UFA + RFA (Restricted FA)
- Qualifying Offers + Offer Sheets
- Contract extensions

### ⚠️ Roster Management
- Waiver wire with priority
- Buy-outs (post-deadline)
- Stretch provision
- Two-way contracts

### 💰 Salary Cap
- Real-time cap tracking
- Luxury tax calculator (with repeater)
- First/Second Apron rules
- Bird Rights (Full, Early, Non-Bird)
- All NBA exceptions (MLE, Bi-Annual, Room, Min)

### 📊 Standings & Games
- 9 types of standings (overall, conference, division, etc)
- NBA tiebreakers
- Round-robin schedule generator
- Result input system
- Playoff seeding

### 👑 Admin Tools
- Commissioner override powers
- Trade veto system
- OVR update (fuzzy matching)
- Manual adjustments
- Investigation mode & sanctions
- Audit logging

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Discord Bot Token
- Firebase project (free tier)

### Installation
```bash
# Clone repository
git clone https://github.com/scigliu82/nba-fantasy-league-bot.git
cd nba-fantasy-league-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your tokens

# Import roster
npm run import-roster

# Deploy commands
npm run deploy-commands

# Start bot
npm start
```

**📚 Full setup guide:** [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)

---

## 📁 Project Structure
```
nba-fantasy-league-bot/
├── src/
│   ├── commands/          # Discord slash commands
│   ├── events/            # Discord event handlers
│   ├── database/          # Database schemas & operations
│   ├── services/          # Business logic
│   ├── algorithms/        # Complex algorithms
│   └── utils/             # Helper functions
├── config/                # Configuration files
├── data/                  # CSV files, backups
├── docs/                  # Documentation
├── scripts/               # Utility scripts
└── package.json
```

---

## 📚 Documentation

- **[Setup Guide](docs/SETUP_GUIDE.md)** - Quick start installation
- **[Master Documentation](docs/NBA_Discord_Bot_Master_Complete_v3.md)** - Complete feature specifications
- **[Contributing](#)** - How to contribute (coming soon)

---

## 🎮 Usage

### For GMs
```bash
/roster              # View your roster
/trade propose       # Propose a trade
/fa offer           # Make free agency offer
/waiver claim       # Claim waiver player
/standings          # View standings
```

### For Admin
```bash
/setup server        # Setup Discord server (first time)
/season start        # Start new season
/trade approve       # Approve trade
/season start_fa     # Open free agency
```

---

## 🗺️ Development Roadmap

- [x] Phase 1: Core setup & database
- [x] Phase 1: Basic commands (roster)
- [ ] Phase 2: Trade system
- [ ] Phase 3: Free agency
- [ ] Phase 4: Waiver wire & buy-outs
- [ ] Phase 5: Admin tools
- [ ] Phase 6: Testing & deployment

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- NBA CBA Rules: Official NBA documentation
- Discord.js: Amazing Discord library
- Firebase: Reliable database solution
- Community: Thanks to all testers and contributors

---

## 📧 Contact

For questions or support:
- Open an issue on GitHub
- Repository: [github.com/scigliu82/nba-fantasy-league-bot](https://github.com/scigliu82/nba-fantasy-league-bot)

---

**Made with ❤️ for NBA Fantasy Leagues**

🏀 Let's build the ultimate fantasy league experience! 🚀