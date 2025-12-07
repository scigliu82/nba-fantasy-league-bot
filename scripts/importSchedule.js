// ═══════════════════════════════════════════════════════
// IMPORT SCHEDULE - Import calendario from Excel to Firestore
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');

// ───────────────────────────────────────────────────────
// NBA TEAMS MAPPING (Full Name → ID)
// ───────────────────────────────────────────────────────

const TEAM_NAME_TO_ID = {
  'Atlanta Hawks': 'hawks',
  'Boston Celtics': 'celtics',
  'Brooklyn Nets': 'nets',
  'Charlotte Hornets': 'hornets',
  'Chicago Bulls': 'bulls',
  'Cleveland Cavaliers': 'cavaliers',
  'Dallas Mavericks': 'mavericks',
  'Denver Nuggets': 'nuggets',
  'Detroit Pistons': 'pistons',
  'Golden State Warriors': 'warriors',
  'Houston Rockets': 'rockets',
  'Indiana Pacers': 'pacers',
  'Los Angeles Clippers': 'clippers',
  'LA Clippers': 'clippers',
  'Los Angeles Lakers': 'lakers',
  'Memphis Grizzlies': 'grizzlies',
  'Miami Heat': 'heat',
  'Milwaukee Bucks': 'bucks',
  'Minnesota Timberwolves': 'timberwolves',
  'New Orleans Pelicans': 'pelicans',
  'New York Knicks': 'knicks',
  'Oklahoma City Thunder': 'thunder',
  'Orlando Magic': 'magic',
  'Philadelphia 76ers': 'sixers',
  'Phoenix Suns': 'suns',
  'Portland Trail Blazers': 'blazers',
  'Sacramento Kings': 'kings',
  'San Antonio Spurs': 'spurs',
  'Toronto Raptors': 'raptors',
  'Utah Jazz': 'jazz',
  'Washington Wizards': 'wizards'
};

// ───────────────────────────────────────────────────────
// INITIALIZE FIREBASE
// ───────────────────────────────────────────────────────

if (!admin.apps.length) {
  // Try service account path first
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Use environment variables
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
  }
}

const db = admin.firestore();

// ───────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ───────────────────────────────────────────────────────

/**
 * Converte nome team in ID
 */
function getTeamId(teamName) {
  const trimmedName = teamName?.trim();
  return TEAM_NAME_TO_ID[trimmedName] || null;
}

/**
 * Legge il file Excel e estrae le partite
 */
function parseExcelSchedule(filePath) {
  console.log(`📖 Reading Excel file: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  console.log(`📊 Sheet: ${sheetName} (${data.length} rows)`);
  
  const games = [];
  let currentRound = null;
  let gameCounter = 1;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Cerca "TURNO X"
    if (row[0] && typeof row[0] === 'string' && row[0].includes('TURNO')) {
      const match = row[0].match(/TURNO\s+(\d+)/i);
      if (match) {
        currentRound = parseInt(match[1]);
        console.log(`\n✅ Found: ${row[0]} (Round ${currentRound})`);
      }
      continue;
    }
    
    // Se abbiamo un turno attivo, cerca le partite
    if (currentRound !== null) {
      const homeTeam = row[0];
      const awayTeam = row[3]; // Colonna D (indice 3)
      
      if (homeTeam && awayTeam && typeof homeTeam === 'string' && typeof awayTeam === 'string') {
        const homeId = getTeamId(homeTeam);
        const awayId = getTeamId(awayTeam);
        
        if (homeId && awayId) {
          games.push({
            game_id: `game_${gameCounter}`,
            round: currentRound,
            home_team: homeId,
            away_team: awayId,
            home_score: null,
            away_score: null,
            played: false
          });
          
          gameCounter++;
        } else {
          console.warn(`⚠️  Row ${i + 1}: Could not map teams: "${homeTeam}" vs "${awayTeam}"`);
        }
      }
    }
  }
  
  return games;
}

// ───────────────────────────────────────────────────────
// MAIN IMPORT FUNCTION
// ───────────────────────────────────────────────────────

async function importSchedule(excelPath, season = '2025-26') {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║        📅 IMPORTING SCHEDULE TO FIRESTORE             ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    
    // Parse Excel
    const games = parseExcelSchedule(excelPath);
    
    if (games.length === 0) {
      console.error('❌ No games found in Excel file!');
      return false;
    }
    
    // Calculate format (games per team)
    const totalGames = games.length;
    const gamesPerTeam = (totalGames * 2) / 30; // Each game involves 2 teams
    
    console.log('\n' + '═'.repeat(60));
    console.log(`📊 SCHEDULE SUMMARY:`);
    console.log(`   Total Games: ${totalGames}`);
    console.log(`   Games per Team: ${gamesPerTeam}`);
    console.log(`   Rounds: ${Math.max(...games.map(g => g.round))}`);
    console.log(`   Season: ${season}`);
    console.log('═'.repeat(60) + '\n');
    
    // Conferma
    console.log('⚠️  This will OVERWRITE existing schedule in Firestore!');
    console.log('📝 Creating schedule document...\n');
    
    // Create schedule document
    const scheduleDoc = {
      season: season,
      format: Math.round(gamesPerTeam),
      total_games: totalGames,
      rounds: Math.max(...games.map(g => g.round)),
      games: games,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active'
    };
    
    // Save to Firestore
    await db.collection('schedules').doc(season).set(scheduleDoc);
    
    console.log('✅ Schedule imported successfully!');
    console.log(`📦 Document ID: ${season}`);
    console.log(`🎯 Games imported: ${totalGames}`);
    console.log(`🏀 Format: ${Math.round(gamesPerTeam)} games per team\n`);
    
    // Show sample games
    console.log('📄 SAMPLE GAMES (first 5):\n');
    games.slice(0, 5).forEach(game => {
      console.log(`   Round ${game.round}: ${game.home_team} vs ${game.away_team} (${game.game_id})`);
    });
    
    console.log('\n🎉 Import complete!\n');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error importing schedule:', error);
    return false;
  }
}

// ───────────────────────────────────────────────────────
// RUN SCRIPT
// ───────────────────────────────────────────────────────

// Get file path from command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n📋 USAGE:');
  console.log('   node importSchedule.js <excel_file_path> [season]\n');
  console.log('📝 EXAMPLE:');
  console.log('   node importSchedule.js ./data/calendario.xlsx 2025-26\n');
  process.exit(1);
}

const excelPath = args[0];
const season = args[1] || '2025-26';

// Check if file exists
const fs = require('fs');
if (!fs.existsSync(excelPath)) {
  console.error(`❌ File not found: ${excelPath}`);
  process.exit(1);
}

// Run import
importSchedule(excelPath, season)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });