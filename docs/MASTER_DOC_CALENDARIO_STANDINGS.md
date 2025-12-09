# 📊 Sistema Calendario, Standings e Risultati - Documentazione Tecnica

**Documento Master per riferimento futuro**

---

## 🎯 PANORAMICA SISTEMA

Il bot gestisce un calendario di 29/58/82 partite con standings automatiche che si aggiornano dopo ogni risultato inserito.

### **Componenti principali:**
1. **Calendario** - Schedule di tutte le partite organizzate per turni
2. **Standings** - 9 classifiche auto-aggiornate (Overall, Conferences, Divisions)
3. **Risultati** - Sistema di inserimento con protezione duplicati
4. **Admin Tools** - Reset, clear, backup/restore

---

## 📅 SISTEMA CALENDARIO

### **Setup Iniziale**
```
/season setup_schedule format:29
```

**Cosa fa:**
1. Importa calendario da Excel (`data/calendario.xlsx`)
2. Crea documento in Firestore `schedules/2025-26`
3. Pubblica 30 messaggi in `#📅-calendario`:
   - 1 header
   - 29 turni (uno per round)
4. Inizializza standings (tutti i team 0-0)
5. Pubblica 10 messaggi in `#📊-standings`:
   - 1 header
   - 9 classifiche

### **Struttura Database - schedules**
```javascript
schedules/2025-26 {
  season: "2025-26",
  format: "29",
  total_games: 431,
  rounds: 29,
  
  games: [
    {
      game_id: "game_1",
      round: 1,
      home_team: "lakers",
      away_team: "celtics",
      home_score: null,      // o numero se giocato
      away_score: null,      // o numero se giocato
      played: false,         // true se giocato
      played_at: null        // timestamp se giocato
    },
    // ... 430 altre partite
  ],
  
  calendar_messages: {
    "1": "message_id_turno_1",
    "2": "message_id_turno_2",
    // ... per tutti i 29 turni
  },
  calendar_channel_id: "channel_id",
  
  created_at: timestamp,
  updated_at: timestamp
}
```

### **Embed Calendario**
```
🏀 TURNO 1

• Atlanta Hawks vs Washington Wizards - ⏳ Da giocare
• Boston Celtics vs Utah Jazz - ⏳ Da giocare
• Los Angeles Lakers vs Boston Celtics - ✅ 110-105
• Brooklyn Nets vs Toronto Raptors - ⏳ Da giocare
...
```

---

## 📊 SISTEMA STANDINGS

### **9 Classifiche Auto-Aggiornate**

1. **Overall** - Tutti i 30 team
2. **Eastern Conference** - 15 team
3. **Western Conference** - 15 team
4. **Atlantic Division** - 5 team
5. **Central Division** - 5 team
6. **Southeast Division** - 5 team
7. **Northwest Division** - 5 team
8. **Pacific Division** - 5 team
9. **Southwest Division** - 5 team

### **Struttura Database - standings**
```javascript
standings/2025-26 {
  season: "2025-26",
  
  teams: {
    "lakers": {
      team_id: "lakers",
      name: "Los Angeles Lakers",
      conference: "western",
      division: "pacific",
      
      // Record principale
      wins: 15,
      losses: 8,
      pct: 0.652,
      gb: 0,
      games_played: 23,
      
      // Home/Away splits
      home_wins: 8,
      home_losses: 4,
      away_wins: 7,
      away_losses: 4,
      
      // Conference/Division
      conf_wins: 10,
      conf_losses: 5,
      div_wins: 5,
      div_losses: 2,
      
      // Recent form
      streak: "W3",
      last_10_wins: 7,
      last_10_losses: 3,
      last_10_games: [
        { opponent: "warriors", result: "W", score: "110-105" },
        { opponent: "celtics", result: "L", score: "95-100" },
        // ... ultimi 10
      ],
      
      // Scoring
      points_for: 2580,
      points_against: 2450,
      point_diff: 130,
      
      // Head-to-head (per tiebreaker)
      head_to_head: {
        "celtics": { wins: 1, losses: 0 },
        "warriors": { wins: 0, losses: 2 }
      }
    },
    // ... altri 29 team
  },
  
  standings_messages: {
    overall: "message_id",
    eastern: "message_id",
    western: "message_id",
    atlantic: "message_id",
    central: "message_id",
    southeast: "message_id",
    northwest: "message_id",
    pacific: "message_id",
    southwest: "message_id"
  },
  standings_channel_id: "channel_id",
  updated_at: timestamp
}
```

### **NBA Tiebreaker Rules (8-step)**
1. Win percentage (PCT)
2. Head-to-head record
3. Division winner (if same division)
4. Conference record
5. W-L vs playoff teams (own conference)
6. W-L vs playoff teams (other conference)
7. Net rating
8. Point differential

### **Games Behind (GB) Calculation**
```javascript
GB = (firstPlace.wins - team.wins + team.losses - firstPlace.losses) / 2
```

### **Embed Standings**
```
📊 OVERALL STANDINGS

 #  Team                W  L   PCT   GB  Home   Away  Conf  Strk L10
──────────────────────────────────────────────────────────────────
 1. Boston Celtics     20  5  .800   -   12-2   8-3   14-3  W5   8-2
 2. LA Lakers          18  7  .720  2.0  10-3   8-4   12-4  W3   7-3
 3. Golden State War   17  8  .680  3.0   9-4   8-4   11-5  L1   6-4
...
30. Washington Wiza     3 22  .120 17.0   2-11  1-11   2-15  L8   1-9
```

---

## 🎮 INSERIMENTO RISULTATI

### **Comando Base**
```
/result add round:1 home_team:lakers away_team:celtics home_score:110 away_score:105
```

### **Workflow Automatico**
```
1. Salva risultato in database (game.played = true)
2. Calcola vincitore/perdente
3. Aggiorna standings:
   - Wins/Losses
   - Home/Away splits
   - Conference/Division records (se applicabile)
   - Streak (W3 → W4 o W3 → L1)
   - Last 10 games
   - Points for/against
   - Point differential
   - Head-to-head
4. Aggiorna tutti i 9 embed in #standings
5. Aggiorna embed turno in #calendario (⏳ Da giocare → ✅ 110-105)
6. Posta annuncio in #announcements
```

### **Protezione Duplicati**
Se la partita è già giocata → **BLOCCO**

```
❌ GAME ALREADY PLAYED

Round 1
Los Angeles Lakers 110 - 105 Boston Celtics

⚠️ Result Already Exists
This game already has a recorded result.

🔧 How to Change the Result

Step 1: Ask an admin to clear:
/clear_result round:1 home_team:lakers away_team:celtics

Step 2: Then re-enter:
/result add round:1 home_team:lakers away_team:celtics home_score:95 away_score:100
```

---

## 🔧 COMANDI ADMIN

### **1. Clear Single Result**
```
/clear_result round:1 home_team:lakers away_team:celtics
```

**Cosa fa:**
1. Rimuove risultato dal database (game.played = false)
2. **Ricalcola standings da ZERO**:
   - Resetta tutti i team a 0-0
   - Rianalizza TUTTE le partite giocate rimaste
   - Ricostruisce standings complete
3. Cancella vecchi embed in #standings
4. Ricrea 10 nuovi embed con standings ricalcolate
5. Aggiorna embed turno in #calendario (✅ 110-105 → ⏳ Da giocare)

**Esempio:**
```
PRIMA:
- Lakers vs Celtics: Lakers vince (Lakers 1-0, Celtics 0-1)
- Warriors vs Clippers: Warriors vince (Warriors 1-0, Clippers 0-1)

/clear_result Lakers-Celtics

DOPO:
- Resetta tutti a 0-0
- Rianalizza solo Warriors-Clippers
- Risultato: Warriors 1-0, Clippers 0-1, Lakers 0-0, Celtics 0-0 ✅
```

---

### **2. Reset Season**
```
/admin reset_season type:[full|results_only|standings_only] confirm:CONFIRM
```

**3 Modalità:**

**A. full** - Reset completo
- Reset tutti i games (played: false)
- Reset standings (tutti 0-0)
- Cancella e ricrea calendario embeds
- Cancella e ricrea standings embeds
- Cancella tutti gli annunci

**B. results_only** - Solo risultati
- Reset tutti i games (played: false)
- Reset standings (tutti 0-0)
- Cancella e ricrea embeds
- NON cancella annunci (mantiene storico)

**C. standings_only** - Ricalcolo standings
- NON tocca i games
- Ricalcola standings da tutte le partite giocate
- Ricrea standings embeds
- Utile se c'è un bug nel calcolo

**Backup Automatico:**
Prima di ogni reset, viene creato automaticamente un backup in `backups/backup_2025-26_timestamp`

---

### **3. Backup & Restore**

**Lista backups:**
```
/restore list
```

**Restore:**
```
/restore backup backup_id:backup_2025-26_2025-12-07T10-30-15 confirm:CONFIRM
```

**Cosa fa restore:**
1. Fetch backup document
2. Restore schedule in Firestore
3. Restore standings in Firestore
4. Cancella vecchi embeds
5. Ricrea calendario embeds
6. Ricrea standings embeds

---

## 📂 FILE PRINCIPALI

### **Services**
```
src/services/standingsService.js
- initializeStandings(season)
- updateStandings(season, homeTeam, awayTeam, homeScore, awayScore)
- recalculateStandings(season)
- getStandings(season, type)
- sortTeams(teams, applyTiebreakers)
- NBA_TEAMS object (30 teams con conference/division)

src/services/standingsDisplayService.js
- generateStandingsEmbed(teams, title, color)
- publishStandingsEmbeds(channel, season)
- refreshStandingsEmbeds(season, guild)

src/services/backupService.js
- createBackup(season, type, userId)
- restoreBackup(backupId)
- listBackups(season, limit)
```

### **Comandi**
```
src/commands/admin/setup-schedule.js
- /season setup_schedule
- Importa calendario + inizializza standings

src/commands/info/result-add.js
- /result add
- Inserisce risultato + aggiorna standings
- Blocco duplicati

src/commands/info/clear-result.js
- /clear_result
- Rimuove risultato + ricalcola standings

src/commands/admin/reset-season.js
- /admin reset_season
- Reset completo con backup automatico

src/commands/info/restore-backup.js
- /restore backup
- /restore list
```

---

## 🔄 FLUSSO TIPICO

### **Setup Stagione**
```
1. /season setup_schedule format:29
   ✅ Calendario importato
   ✅ Standings inizializzate (0-0)
   ✅ 30 embed in #calendario
   ✅ 10 embed in #standings
```

### **Durante Stagione**
```
2. /result add round:1 home_team:lakers away_team:celtics home_score:110 away_score:105
   ✅ Risultato salvato
   ✅ Standings aggiornate (Lakers 1-0, Celtics 0-1)
   ✅ 9 embed aggiornati
   ✅ Calendario aggiornato (✅ 110-105)
   ✅ Annuncio postato

3. /result add round:1 home_team:lakers away_team:celtics home_score:95 away_score:100
   ❌ BLOCCATO - partita già giocata
```

### **Correzione (Admin Only)**
```
4. /clear_result round:1 home_team:lakers away_team:celtics
   ✅ Risultato rimosso
   ✅ Standings ricalcolate da zero
   ✅ Embed ricreati (Lakers 0-0, Celtics 0-0)

5. /result add round:1 home_team:lakers away_team:celtics home_score:95 away_score:100
   ✅ Nuovo risultato corretto
   ✅ Standings: Lakers 0-1, Celtics 1-0
```

### **Fine Stagione / Nuovo Anno**
```
6. /admin reset_season type:full confirm:CONFIRM
   ✅ Backup creato
   ✅ Tutto resettato
   ✅ Pronto per nuova stagione
```

---

## 🎯 LOGICA STANDINGS UPDATE

### **Quando inserisci un risultato:**

```javascript
// 1. Determina vincitore/perdente
const winner = homeScore > awayScore ? homeTeam : awayTeam;
const loser = homeScore > awayScore ? awayTeam : homeTeam;

// 2. Aggiorna wins/losses
winner.wins++;
loser.losses++;

// 3. Calcola PCT
team.pct = team.wins / (team.wins + team.losses);

// 4. Home/Away splits
if (winner === homeTeam) {
  winner.home_wins++;
  loser.away_losses++;
} else {
  winner.away_wins++;
  loser.home_losses++;
}

// 5. Conference game?
if (winner.conference === loser.conference) {
  winner.conf_wins++;
  loser.conf_losses++;
}

// 6. Division game?
if (winner.division === loser.division) {
  winner.div_wins++;
  loser.div_losses++;
}

// 7. Update streak
// W3 → W4 oppure W3 → L1

// 8. Update last 10
// Push nuovo game, shift vecchio se > 10

// 9. Update scoring
winner.points_for += winnerScore;
winner.points_against += loserScore;
winner.point_diff = winner.points_for - winner.points_against;

// 10. Update head-to-head
winner.head_to_head[loser] = { wins: X, losses: Y };
```

### **Quando fai clear + ricalcolo:**

```javascript
// 1. Reset tutti a 0-0
await initializeStandings(season);

// 2. Prendi TUTTE le partite giocate
const playedGames = schedule.games.filter(g => g.played);

// 3. Rianalizza ogni partita UNA PER UNA
for (const game of playedGames) {
  await updateStandings(
    season,
    game.home_team,
    game.away_team,
    game.home_score,
    game.away_score
  );
}

// Risultato: Standings = somma matematica di tutte le partite
```

---

## 🛠️ APPROCCIO TECNICO IMPORTANTE

### **Delete + Recreate Embeds**

Tutti i comandi che aggiornano embeds usano questo approccio:
```javascript
// 1. Cancella vecchi messaggi
const messages = await channel.messages.fetch({ limit: 100 });
await channel.bulkDelete(messages);

// 2. Ricrea nuovi messaggi
await publishStandingsEmbeds(channel, season);
```

**Perché:**
- Più affidabile del semplice edit
- Garantisce sincronizzazione
- Evita problemi con message_id invalidi

**Usato in:**
- `/season setup_schedule`
- `/admin reset_season`
- `/clear_result`

---

## 📌 NOTE IMPORTANTI

1. **Gli embed si aggiornano SEMPRE automaticamente** dopo ogni `/result add`
2. **Non serve mai rilanciare setup** dopo aver inserito risultati
3. **Clear result ricalcola TUTTO** da zero per garantire correttezza matematica
4. **I backup vengono creati automaticamente** prima di ogni reset
5. **Le standings seguono le regole NBA ufficiali** (8-step tiebreaker)
6. **Head-to-head viene tracciato** per tiebreaker accurati
7. **Ogni partita ha un game_id univoco** per evitare duplicati

---

**Fine documento master**