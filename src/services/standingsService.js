// ═══════════════════════════════════════════════════════
// STANDINGS SERVICE - Business Logic
// ═══════════════════════════════════════════════════════

const admin = require('firebase-admin');

// ───────────────────────────────────────────────────────
// NBA TEAMS DATA WITH CONFERENCE/DIVISION
// ───────────────────────────────────────────────────────

const NBA_TEAMS = {
  // Eastern Conference - Atlantic
  celtics: { name: 'Boston Celtics', conference: 'eastern', division: 'atlantic' },
  nets: { name: 'Brooklyn Nets', conference: 'eastern', division: 'atlantic' },
  knicks: { name: 'New York Knicks', conference: 'eastern', division: 'atlantic' },
  sixers: { name: 'Philadelphia 76ers', conference: 'eastern', division: 'atlantic' },
  raptors: { name: 'Toronto Raptors', conference: 'eastern', division: 'atlantic' },
  
  // Eastern Conference - Central
  bulls: { name: 'Chicago Bulls', conference: 'eastern', division: 'central' },
  cavaliers: { name: 'Cleveland Cavaliers', conference: 'eastern', division: 'central' },
  pistons: { name: 'Detroit Pistons', conference: 'eastern', division: 'central' },
  pacers: { name: 'Indiana Pacers', conference: 'eastern', division: 'central' },
  bucks: { name: 'Milwaukee Bucks', conference: 'eastern', division: 'central' },
  
  // Eastern Conference - Southeast
  hawks: { name: 'Atlanta Hawks', conference: 'eastern', division: 'southeast' },
  hornets: { name: 'Charlotte Hornets', conference: 'eastern', division: 'southeast' },
  heat: { name: 'Miami Heat', conference: 'eastern', division: 'southeast' },
  magic: { name: 'Orlando Magic', conference: 'eastern', division: 'southeast' },
  wizards: { name: 'Washington Wizards', conference: 'eastern', division: 'southeast' },
  
  // Western Conference - Northwest
  nuggets: { name: 'Denver Nuggets', conference: 'western', division: 'northwest' },
  timberwolves: { name: 'Minnesota Timberwolves', conference: 'western', division: 'northwest' },
  thunder: { name: 'Oklahoma City Thunder', conference: 'western', division: 'northwest' },
  blazers: { name: 'Portland Trail Blazers', conference: 'western', division: 'northwest' },
  jazz: { name: 'Utah Jazz', conference: 'western', division: 'northwest' },
  
  // Western Conference - Pacific
  warriors: { name: 'Golden State Warriors', conference: 'western', division: 'pacific' },
  clippers: { name: 'LA Clippers', conference: 'western', division: 'pacific' },
  lakers: { name: 'Los Angeles Lakers', conference: 'western', division: 'pacific' },
  suns: { name: 'Phoenix Suns', conference: 'western', division: 'pacific' },
  kings: { name: 'Sacramento Kings', conference: 'western', division: 'pacific' },
  
  // Western Conference - Southwest
  mavericks: { name: 'Dallas Mavericks', conference: 'western', division: 'southwest' },
  rockets: { name: 'Houston Rockets', conference: 'western', division: 'southwest' },
  grizzlies: { name: 'Memphis Grizzlies', conference: 'western', division: 'southwest' },
  pelicans: { name: 'New Orleans Pelicans', conference: 'western', division: 'southwest' },
  spurs: { name: 'San Antonio Spurs', conference: 'western', division: 'southwest' }
};

// ───────────────────────────────────────────────────────
// INITIALIZE STANDINGS
// ───────────────────────────────────────────────────────

async function initializeStandings(season) {
  console.log(`📊 Initializing standings for ${season}...`);
  
  const db = admin.firestore();
  const teams = {};
  
  // Initialize all 30 teams with 0-0 record
  for (const [teamId, teamData] of Object.entries(NBA_TEAMS)) {
    teams[teamId] = {
      team_id: teamId,
      name: teamData.name,
      conference: teamData.conference,
      division: teamData.division,
      
      // Record
      wins: 0,
      losses: 0,
      pct: 0.000,
      gb: 0,
      
      // Home/Away
      home_wins: 0,
      home_losses: 0,
      away_wins: 0,
      away_losses: 0,
      
      // Conference/Division
      conf_wins: 0,
      conf_losses: 0,
      div_wins: 0,
      div_losses: 0,
      
      // Streak & Recent
      streak: '-',
      last_10_wins: 0,
      last_10_losses: 0,
      last_10_games: [],
      
      // Scoring
      points_for: 0,
      points_against: 0,
      point_diff: 0,
      
      // Head-to-head
      head_to_head: {},
      
      games_played: 0
    };
    
    // Initialize head-to-head for all other teams
    for (const otherTeamId of Object.keys(NBA_TEAMS)) {
      if (otherTeamId !== teamId) {
        teams[teamId].head_to_head[otherTeamId] = { wins: 0, losses: 0 };
      }
    }
  }
  
  const standingsDoc = {
    season: season,
    teams: teams,
    standings_messages: {},
    standings_channel_id: null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  
  await db.collection('standings').doc(season).set(standingsDoc);
  
  console.log('✅ Standings initialized for all 30 teams');
  
  return standingsDoc;
}

// ───────────────────────────────────────────────────────
// UPDATE STANDINGS AFTER GAME RESULT
// ───────────────────────────────────────────────────────

async function updateStandings(season, homeTeamId, awayTeamId, homeScore, awayScore) {
  console.log(`📊 Updating standings: ${homeTeamId} ${homeScore}-${awayScore} ${awayTeamId}`);
  
  const db = admin.firestore();
  const standingsRef = db.collection('standings').doc(season);
  const standingsDoc = await standingsRef.get();
  
  if (!standingsDoc.exists) {
    throw new Error(`Standings not found for season ${season}`);
  }
  
  const standings = standingsDoc.data();
  const teams = standings.teams;
  
  const homeTeam = teams[homeTeamId];
  const awayTeam = teams[awayTeamId];
  
  if (!homeTeam || !awayTeam) {
    throw new Error(`Team not found: ${homeTeamId} or ${awayTeamId}`);
  }
  
  // Determine winner and loser
  const isHomeWin = homeScore > awayScore;
  const winner = isHomeWin ? homeTeam : awayTeam;
  const loser = isHomeWin ? awayTeam : homeTeam;
  const winnerId = isHomeWin ? homeTeamId : awayTeamId;
  const loserId = isHomeWin ? awayTeamId : homeTeamId;
  const winnerScore = isHomeWin ? homeScore : awayScore;
  const loserScore = isHomeWin ? awayScore : homeScore;
  
  // Update wins/losses
  winner.wins += 1;
  loser.losses += 1;
  winner.games_played += 1;
  loser.games_played += 1;
  
  // Update PCT
  winner.pct = winner.wins / (winner.wins + winner.losses);
  loser.pct = loser.losses === 0 ? 1.000 : loser.wins / (loser.wins + loser.losses);
  
  // Update home/away
  if (isHomeWin) {
    winner.home_wins += 1;
    loser.away_losses += 1;
  } else {
    winner.away_wins += 1;
    loser.home_losses += 1;
  }
  
  // Update points
  winner.points_for += winnerScore;
  winner.points_against += loserScore;
  winner.point_diff = winner.points_for - winner.points_against;
  
  loser.points_for += loserScore;
  loser.points_against += winnerScore;
  loser.point_diff = loser.points_for - loser.points_against;
  
  // Update conference/division
  if (winner.conference === loser.conference) {
    winner.conf_wins += 1;
    loser.conf_losses += 1;
    
    if (winner.division === loser.division) {
      winner.div_wins += 1;
      loser.div_losses += 1;
    }
  }
  
  // Update head-to-head
  winner.head_to_head[loserId].wins += 1;
  loser.head_to_head[winnerId].losses += 1;
  
  // Update streak
  updateStreak(winner, 'W');
  updateStreak(loser, 'L');
  
  // Update last 10
  updateLast10(winner, winnerId, loserId, 'W', `${winnerScore}-${loserScore}`);
  updateLast10(loser, loserId, winnerId, 'L', `${loserScore}-${winnerScore}`);
  
  // Save updated standings
  await standingsRef.update({
    teams: teams,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log('✅ Standings updated successfully');
  
  return standings;
}

// ───────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ───────────────────────────────────────────────────────

function updateStreak(team, result) {
  const currentStreak = team.streak;
  
  if (currentStreak === '-') {
    team.streak = result + '1';
    return;
  }
  
  const streakType = currentStreak[0];
  const streakCount = parseInt(currentStreak.substring(1));
  
  if (streakType === result) {
    // Continue streak
    team.streak = result + (streakCount + 1);
  } else {
    // Break streak
    team.streak = result + '1';
  }
}

function updateLast10(team, teamId, opponentId, result, score) {
  team.last_10_games.push({
    opponent: opponentId,
    result: result,
    score: score
  });
  
  // Keep only last 10
  if (team.last_10_games.length > 10) {
    team.last_10_games.shift();
  }
  
  // Recalculate last 10 record
  team.last_10_wins = team.last_10_games.filter(g => g.result === 'W').length;
  team.last_10_losses = team.last_10_games.filter(g => g.result === 'L').length;
}

// ───────────────────────────────────────────────────────
// SORT TEAMS WITH TIEBREAKERS
// ───────────────────────────────────────────────────────

function sortTeams(teams, applyTiebreakers = true) {
  const teamsArray = Object.values(teams);
  
  teamsArray.sort((a, b) => {
    // 1. Win percentage
    if (a.pct !== b.pct) return b.pct - a.pct;
    
    if (!applyTiebreakers) return 0;
    
    // 2. Head-to-head
    const h2h = a.head_to_head[b.team_id];
    if (h2h && (h2h.wins + h2h.losses > 0)) {
      const h2hPct = h2h.wins / (h2h.wins + h2h.losses);
      if (h2hPct !== 0.5) return h2hPct > 0.5 ? -1 : 1;
    }
    
    // 3. Division winner (if same division)
    if (a.division === b.division) {
      const aDivPct = a.div_wins / (a.div_wins + a.div_losses || 1);
      const bDivPct = b.div_wins / (b.div_wins + b.div_losses || 1);
      if (aDivPct !== bDivPct) return bDivPct - aDivPct;
    }
    
    // 4. Conference record
    const aConfPct = a.conf_wins / (a.conf_wins + a.conf_losses || 1);
    const bConfPct = b.conf_wins / (b.conf_wins + b.conf_losses || 1);
    if (aConfPct !== bConfPct) return bConfPct - aConfPct;
    
    // 5. Win percentage vs playoff teams (TODO: implement)
    
    // 6. Net rating (TODO: implement)
    
    // 7. Point differential
    return b.point_diff - a.point_diff;
  });
  
  return teamsArray;
}

// ───────────────────────────────────────────────────────
// CALCULATE GAMES BEHIND
// ───────────────────────────────────────────────────────

function calculateGamesBehind(teams) {
  if (teams.length === 0) return teams;
  
  const firstPlace = teams[0];
  
  teams.forEach(team => {
    if (team.team_id === firstPlace.team_id) {
      team.gb = 0;
    } else {
      const winDiff = firstPlace.wins - team.wins;
      const lossDiff = team.losses - firstPlace.losses;
      team.gb = (winDiff + lossDiff) / 2;
    }
  });
  
  return teams;
}

// ───────────────────────────────────────────────────────
// GET STANDINGS BY TYPE
// ───────────────────────────────────────────────────────

async function getStandings(season, type = 'overall') {
  const db = admin.firestore();
  const standingsDoc = await db.collection('standings').doc(season).get();
  
  if (!standingsDoc.exists) {
    return null;
  }
  
  const standings = standingsDoc.data();
  let teams = Object.values(standings.teams);
  
  // Filter by type
  if (type === 'eastern') {
    teams = teams.filter(t => t.conference === 'eastern');
  } else if (type === 'western') {
    teams = teams.filter(t => t.conference === 'western');
  } else if (type === 'atlantic' || type === 'central' || type === 'southeast' || 
             type === 'northwest' || type === 'pacific' || type === 'southwest') {
    teams = teams.filter(t => t.division === type);
  }
  
  // Sort and calculate GB
  teams = sortTeams(teams);
  teams = calculateGamesBehind(teams);
  
  return teams;
}

// ───────────────────────────────────────────────────────
// RECALCULATE STANDINGS FROM SCHEDULE
// ───────────────────────────────────────────────────────

async function recalculateStandings(season) {
  console.log(`🔄 Recalculating standings from schedule for ${season}...`);
  
  const db = admin.firestore();
  
  // Get schedule
  const scheduleDoc = await db.collection('schedules').doc(season).get();
  if (!scheduleDoc.exists) {
    throw new Error(`Schedule not found for season ${season}`);
  }
  
  const schedule = scheduleDoc.data();
  
  // Reset standings to 0-0
  await initializeStandings(season);
  
  // Replay all games
  const playedGames = schedule.games.filter(g => g.played);
  
  console.log(`📊 Replaying ${playedGames.length} games...`);
  
  for (const game of playedGames) {
    await updateStandings(season, game.home_team, game.away_team, game.home_score, game.away_score);
  }
  
  console.log('✅ Standings recalculated successfully');
  
  return true;
}

// ───────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────

module.exports = {
  initializeStandings,
  updateStandings,
  sortTeams,
  calculateGamesBehind,
  getStandings,
  recalculateStandings,
  NBA_TEAMS
};