# 🏀 FREE AGENCY SYSTEM - FASE 1: Import & Setup

**Data:** 08/12/2024  
**Status:** ✅ COMPLETATO

---

## 📋 PANORAMICA

Sistema completo per gestione Free Agency con:
- 140 giocatori UFA dall'Excel
- Timer 48h dalla PRIMA offerta (Opzione 1 - Fixed Deadline)
- 6 funding methods (Cap Space, MLE×2, Room, BAE, Vet Min)
- Minimum salary basato su esperienza NBA
- Algoritmo decisione con Loyalty, Money Imp, Win Imp

---

## ✅ FASE 1 COMPLETATA

### **1. Import Excel → JSON**

**File:** `ufa_2025_import.json`

**Struttura:**
```json
{
  "season": "2025-26",
  "updated_at": null,
  "players": {
    "russel_westbrook": {
      "player_id": "russel_westbrook",
      "name": "Russel Westbrook",
      "role": "PG",
      "age": 37,
      "overall": 81,
      "experience": 17,
      "loyalty": 50,
      "money_imp": 50,
      "win_imp": 50,
      "status": "available",
      "current_offers": [],
      "signed_team": null,
      "signed_at": null,
      "waived": false,
      "previous_team": null,
      "waived_date": null,
      "cut_method": null
    },
    // ... altri 139 giocatori
  }
}
```

**Totale:** 140 giocatori UFA

---

### **2. Free Agent Service**

**File:** `src/services/freeAgentService.js`

**Funzioni implementate:**

#### **A. Minimum Salary Table**
```javascript
const MINIMUM_SALARIES = {
  0: 1100000,   // $1.1M
  1-2: 1900000, // $1.9M
  3-4: 2100000, // $2.1M
  5-6: 2300000, // $2.3M
  7-9: 2600000, // $2.6M
  10+: 3200000  // $3.2M
};

getMinimumSalary(experience) // Calcola minimum basato su anni
```

#### **B. Gruppi Alfabetici (7 gruppi, max 25 per gruppo)**
```javascript
const ALPHABET_GROUPS = [
  { id: 'group_1', label: 'A-C', start: 'A', end: 'C' },    // 24 players
  { id: 'group_2', label: 'D-I', start: 'D', end: 'I' },    // 25 players
  { id: 'group_3', label: 'J', start: 'J', end: 'J' },      // 22 players
  { id: 'group_4', label: 'K-L', start: 'K', end: 'L' },    // 14 players
  { id: 'group_5', label: 'M-Q', start: 'M', end: 'Q' },    // 24 players
  { id: 'group_6', label: 'R-S', start: 'R', end: 'S' },    // 14 players
  { id: 'group_7', label: 'T-Z', start: 'T', end: 'Z' }     // 17 players
];

getPlayersInGroup(players, groupId) // Filtra players per gruppo
```

#### **C. Database Operations**
```javascript
// Import
importFAMarket(season, playersData)

// Fetch
getFAMarket(season)
getPlayer(season, playerId)
getAvailablePlayers(season, filters)

// Update
updatePlayerStatus(season, playerId, status, data)

// Cut player (aggiunge a FA market)
addPlayerToMarket(season, playerData)

// Sign player (rimuove da FA market)
removePlayerFromMarket(season, playerId)
```

#### **D. Offer Management**
```javascript
// Create offer
createOffer(offerData)

// Timer 48h dalla PRIMA offerta
getFirstOfferTime(season, playerId)

// Fetch offers
getPlayerOffers(season, playerId)
getTeamOffers(season, teamId, status)
```

---

### **3. Comando Admin Import**

**File:** `src/commands/admin/fa-import.js`

**Comando:**
```
/fa-import season:2025-26 file:ufa_2025_import.json
```

**Cosa fa:**
1. Legge JSON da cartella `data/`
2. Valida struttura file
3. Import in Firestore `free_agents/fa_2025-26`
4. Mostra embed con statistiche

**Output:**
```
✅ FREE AGENTS IMPORTED

Total Players: 140
Season: 2025-26
Source File: ufa_2025_import.json

Top Roles:
• PM / G: 26
• G / AP: 22
• AP / G: 15
• AP / AG: 14
• AG / C: 13
...
```

---

## 📊 STRUTTURA DATABASE FIRESTORE

### **Collection: free_agents**

```
free_agents/
  fa_2025-26/
    season: "2025-26"
    updated_at: timestamp
    players: {
      russel_westbrook: { ... },
      malcolm_brogdon: { ... },
      // ... 138 altri
    }
```

### **Collection: fa_offers** (usata in Fase 3)

```
fa_offers/
  offer_1733670000_lakers/
    offer_id: "offer_1733670000_lakers"
    season: "2025-26"
    player_id: "russel_westbrook"
    team_id: "lakers"
    contract: {
      years: 2,
      annual_salary: 5000000,
      total_value: 10000000,
      funding: "cap_space"
    }
    status: "pending"
    created_at: timestamp
    expires_at: timestamp (+48h dalla PRIMA offerta)
```

---

## 🚀 INSTALLAZIONE

### **Step 1: Copia i file**

```bash
# Service
copy freeAgentService.js src\services\freeAgentService.js

# Comando admin
copy fa-import.js src\commands\admin\fa-import.js

# JSON data
copy ufa_2025_import.json data\ufa_2025_import.json
```

---

### **Step 2: Deploy comando**

```bash
npm run deploy-commands
```

**Output atteso:**
```
✅ Registered command: fa-import (new)
```

---

### **Step 3: Restart bot**

```bash
npm start
```

---

### **Step 4: Import FA**

Nel Discord:
```
/fa-import season:2025-26 file:ufa_2025_import.json
```

**Verifica:**
- ✅ Embed di successo mostrato
- ✅ 140 giocatori importati
- ✅ Firestore: `free_agents/fa_2025-26` creato

---

## 🧪 TEST

### **Test 1: Import**
```
/fa-import season:2025-26
```

**Expected:**
```
✅ FREE AGENTS IMPORTED
Total Players: 140
```

### **Test 2: Verifica Firestore**

Console Firebase:
```
free_agents/fa_2025-26
  ├─ season: "2025-26"
  ├─ updated_at: [timestamp]
  └─ players: {140 objects}
```

### **Test 3: Minimum Salary**

```javascript
const { getMinimumSalary } = require('./services/freeAgentService');

console.log(getMinimumSalary(0));   // 1100000 ($1.1M)
console.log(getMinimumSalary(5));   // 2300000 ($2.3M)
console.log(getMinimumSalary(17));  // 3200000 ($3.2M) - Westbrook
```

---

## 📋 PROSSIME FASI

### **FASE 2: FA Market Viewer (domani)**
- `/fa list` - Lista completa con filtri
- Paginazione (15 per pagina)
- Filtri: role, overall, age
- Sort: overall, age, name

### **FASE 3: Make Offer (dopodomani)**
- `/fa offer` - Step 1: Gruppo alfabetico
- Step 2: Selezione player
- Step 3: Form contratto con funding method
- Validazione cap space + minimum salary

### **FASE 4: View & Decision**
- `/fa view_offers` - Vedi offerte fatte
- Timer 48h automatico
- `/fa force_decision` - Admin bypass
- Algoritmo decisione (Loyalty/Money/Win)

### **FASE 5: Cut Player**
- `/cut player` - Taglia giocatore
- Opzioni: normal / stretch / amnesty
- Auto-add a FA market
- Dead money tracking

---

## 🎯 LOGICA TIMER 48H (Opzione 1 - Fixed Deadline)

```
Lakers offrono a Westbrook: Mercoledì 10:00
→ Timer INIZIA: 48h (scade Venerdì 10:00)
→ Annuncio: "Decision deadline: Friday 10:00"

Warriors offrono: Giovedì 08:00 (26h dopo)
→ Timer INVARIATO: scade sempre Venerdì 10:00
→ Annuncio: "Decision in 26 hours"

Celtics offrono: Venerdì 08:00 (2h prima scadenza)
→ Timer INVARIATO: scade Venerdì 10:00
→ Annuncio: "Decision in 2 hours"

Venerdì 10:00 → Algoritmo decide tra TUTTE le offerte ricevute
```

**Vantaggi:**
- ✅ Deadline CERTA per tutti
- ✅ Semplice da trackare
- ✅ Incoraggia competizione immediata
- ✅ Non può durare all'infinito

---

## 📊 STATISTICHE IMPORT

**Totale giocatori:** 140

**Per ruolo (Top 10):**
- PM / G: 26
- G / AP: 22
- AP / G: 15
- AP / AG: 14
- AG / C: 13
- AG / AP: 12
- C: 11
- C / AG: 10
- PM: 7
- G / PM: 4

**Overall:**
- Min: 68
- Max: 81 (Russell Westbrook)
- Media: 70.7

**Età:**
- Min: 24
- Max: 37 (Westbrook)
- Media: 28

**Esperienza:**
- Min: 3 anni
- Max: 17 anni (Westbrook)

---

## ✅ CHECKLIST FASE 1

- [x] Import Excel → JSON
- [x] Service freeAgentService.js
- [x] Comando /fa-import
- [x] Minimum salary table
- [x] Gruppi alfabetici
- [x] Database structure
- [x] Test import

**FASE 1 COMPLETATA! ✅**

**Pronto per FASE 2: FA Market Viewer** 🚀

---

## 📝 NOTE TECNICHE

### **Player ID Generation**
```javascript
// Nome → player_id
"Russell Westbrook" → "russell_westbrook"
"Malcolm Brogdon" → "malcolm_brogdon"
"A.J. Green" → "aj_green"

// Remove: spaces, dots, apostrophes
// Replace: spaces with underscore
// Lowercase
```

### **Timer 48h Implementation**
```javascript
// Quando prima offerta arriva
const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

// Salva in tutte le offerte successive
offer.expires_at = firstOfferExpiresAt;

// Cron job controlla ogni ora
if (now >= offer.expires_at && offer.status === 'pending') {
  decideFreeAgent(player_id);
}
```

### **Funding Methods (6 opzioni)**
1. **cap_space** - Spazio salariale libero
2. **nontax_mle** - MLE Non-Taxpayer ($14.1M, 4yr)
3. **tax_mle** - MLE Taxpayer ($5.7M, 3yr)
4. **room** - Room Exception ($8.78M, 2yr)
5. **bae** - Bi-Annual Exception ($4.75M, 2yr, ogni 2 stagioni)
6. **vet_min** - Veteran Minimum (varia per esperienza)

---

**Fine Fase 1 Documentation** 🎉