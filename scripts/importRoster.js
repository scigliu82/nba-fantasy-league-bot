// ═══════════════════════════════════════════════════════
// IMPORT ROSTER FROM CSV
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { initializeDatabase, collections, admin } = require('../src/database/firebase');

// ───────────────────────────────────────────────────────
// CONFIGURATION
// ───────────────────────────────────────────────────────

const CSV_PATH = path.join(__dirname, '../data/roster.csv');
const BATCH_SIZE = 500; // Firestore limit

// ───────────────────────────────────────────────────────
// MAIN IMPORT FUNCTION
// ───────────────────────────────────────────────────────

async function importRoster() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🏀 NBA FANTASY LEAGUE - ROSTER IMPORT');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Initialize database
    console.log('📊 Connecting to database...');
    await initializeDatabase();
    console.log('✅ Database connected\n');

    // Check if CSV exists
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`CSV file not found at: ${CSV_PATH}`);
    }

    // Read and parse CSV
    console.log('📄 Reading CSV file...');
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parseResult.errors.length > 0) {
      console.error('⚠️  CSV parsing errors:', parseResult.errors);
    }

    const rows = parseResult.data;
    console.log(`✅ Parsed ${rows.length} rows\n`);

    // Separate players and teams
    const players = [];
    const teams = {};

    console.log('🔍 Processing rows...');
    
    for (const row of rows) {
      const team = normalizeTeamName(row.Team);
      
      // Initialize team if not exists
      if (!teams[team]) {
        teams[team] = initializeTeam(row.Team);
      }

      // Create player object
      const player = createPlayerFromRow(row, team);
      
      if (player) {
        players.push(player);
        teams[team].roster.standard.push({
          player_id: player.id,
          acquired_date: '2025-10-01',
          acquired_via: 'initial_roster',
        });
      }
    }

    console.log(`✅ Processed ${players.length} players`);
    console.log(`✅ Processed ${Object.keys(teams).length} teams\n`);

    // Import to database
    console.log('📤 Importing to database...\n');

    // Import teams
    console.log('📋 Importing teams...');
    await importTeams(teams);
    console.log(`✅ Imported ${Object.keys(teams).length} teams\n`);

    // Import players (in batches)
    console.log('👥 Importing players...');
    await importPlayers(players);
    console.log(`✅ Imported ${players.length} players\n`);

    // Initialize season
    console.log('📅 Initializing season...');
    await initializeSeason();
    console.log('✅ Season initialized\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ IMPORT COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ IMPORT FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ───────────────────────────────────────────────────────

function normalizeTeamName(teamName) {
  // Convert "Los Angeles Lakers" → "lakers"
  return teamName
    .toLowerCase()
    .split(' ')
    .pop() // Get last word (team name)
    .replace(/[^a-z0-9]/g, '');
}

function initializeTeam(fullName) {
  const teamId = normalizeTeamName(fullName);
  
  // Parse city and name
  const parts = fullName.split(' ');
  const name = parts.pop();
  const city = parts.join(' ');

  return {
    _id: teamId,
    name: fullName,
    city: city,
    abbreviation: getTeamAbbreviation(teamId),
    conference: getTeamConference(teamId),
    division: getTeamDivision(teamId),
    
    roster: {
      standard: [],
      two_way: []
    },
    
    record: {
      wins: 0,
      losses: 0,
      win_pct: 0.000,
      home: { wins: 0, losses: 0 },
      road: { wins: 0, losses: 0 },
      conference: { wins: 0, losses: 0 },
      division: { wins: 0, losses: 0 },
      last_10: { wins: 0, losses: 0 },
      streak: { type: null, count: 0 }
    },
    
    salary: {},
    
    gm: null,
    
    waiver_priority: 0,
  };
}

function createPlayerFromRow(row, team) {
  try {
    const playerId = row.Nome
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');

    // Parse contract
    const contract = {};
    const seasons = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
    
    for (const season of seasons) {
      const salaryStr = row[season];
      
      if (!salaryStr || salaryStr === 'UFA' || salaryStr === 'RFA') {
        contract[season] = {
          salary: 0,
          status: salaryStr || 'UFA'
        };
      } else {
        contract[season] = {
          salary: parseInt(salaryStr.replace(/[^0-9]/g, '')),
          guaranteed: true,
          status: 'signed'
        };
      }
    }

    // Parse options
    let optionType = null;
    let optionYear = null;
    
    if (row.Option_Type && row.Option_Year) {
      optionType = row.Option_Type.toLowerCase();
      optionYear = parseInt(row.Option_Year);
      
      if (optionYear >= 1 && optionYear <= 6) {
        const season = seasons[optionYear - 1];
        if (contract[season]) {
          contract[season].player_option = (optionType === 'po');
          contract[season].team_option = (optionType === 'to');
        }
      }
    }

    return {
      id: playerId,
      name: row.Nome,
      first_name: row.Nome.split(' ')[0],
      last_name: row.Nome.split(' ').slice(1).join(' '),
      
      position: row.Posizione,
      age: parseInt(row.Età),
      overall: parseInt(row.Overall),
      experience_years: parseInt(row.Esperienza),
      
      current_team: team,
      contract_type: row.Contract_Type || 'standard',
      
      contract: contract,
      
      bird_rights: {
        years: parseInt(row.Bird_Rights) || 0,
        status: getBirdRightsStatus(parseInt(row.Bird_Rights) || 0),
        acquired_date: '2023-10-01'
      },
      
      personality: {
        loyalty: parseInt(row.Loyalty) || 50,
        money_importance: parseInt(row.Money_Importance) || 50,
        win_desire: parseInt(row.Win_Desire) || 50
      },
      
      base_year_compensation: {
        active: false,
        signed_date: null,
        previous_salary: 0
      },
      
      rfa_status: {
        is_rfa: false,
        qualifying_offer: null,
        original_team: null
      }
    };

  } catch (error) {
    console.error(`⚠️  Error processing player: ${row.Nome}`, error.message);
    return null;
  }
}

function getBirdRightsStatus(years) {
  if (years >= 3) return 'full';
  if (years === 2) return 'early';
  if (years === 1) return 'non';
  return 'none';
}

async function importTeams(teams) {
  const batch = admin.firestore().batch();
  let count = 0;

  for (const [teamId, teamData] of Object.entries(teams)) {
    const ref = collections.teams().doc(teamId);
    batch.set(ref, teamData);
    count++;
    
    if (count % 10 === 0) {
      console.log(`   • Processed ${count}/${Object.keys(teams).length} teams`);
    }
  }

  await batch.commit();
  console.log(`   • Committed all teams`);
}

async function importPlayers(players) {
  const batches = [];
  let currentBatch = admin.firestore().batch();
  let operationCount = 0;

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const ref = collections.players().doc(player.id);
    
    currentBatch.set(ref, player);
    operationCount++;

    // Firestore batch limit is 500
    if (operationCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = admin.firestore().batch();
      operationCount = 0;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`   • Processed ${i + 1}/${players.length} players`);
    }
  }

  // Add remaining operations
  if (operationCount > 0) {
    batches.push(currentBatch);
  }

  console.log(`   • Committing ${batches.length} batch(es)...`);

  // Commit all batches
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`   • Committed batch ${i + 1}/${batches.length}`);
  }
}

async function initializeSeason() {
  const seasonData = {
    id: '2025-26',
    current: true,
    status: 'not_started',
    
    salary_cap: parseInt(process.env.SALARY_CAP),
    luxury_tax: parseInt(process.env.LUXURY_TAX),
    first_apron: parseInt(process.env.FIRST_APRON),
    second_apron: parseInt(process.env.SECOND_APRON),
    
    trade_deadline: null,
    schedule_format: 58,
    
    started_at: null,
    ended_at: null,
  };

  await collections.seasons().doc('2025-26').set(seasonData);
}

// ───────────────────────────────────────────────────────
// TEAM DATA (abbreviations, conferences, divisions)
// ───────────────────────────────────────────────────────

function getTeamAbbreviation(teamId) {
  const abbr = {
    lakers: 'LAL', warriors: 'GSW', celtics: 'BOS', heat: 'MIA',
    bucks: 'MIL', nets: 'BKN', sixers: 'PHI', knicks: 'NYK',
    raptors: 'TOR', bulls: 'CHI', cavaliers: 'CLE', pistons: 'DET',
    pacers: 'IND', hawks: 'ATL', hornets: 'CHA', magic: 'ORL',
    wizards: 'WAS', nuggets: 'DEN', thunder: 'OKC', timberwolves: 'MIN',
    blazers: 'POR', jazz: 'UTA', mavericks: 'DAL', rockets: 'HOU',
    grizzlies: 'MEM', pelicans: 'NOP', spurs: 'SAS', suns: 'PHX',
    kings: 'SAC', clippers: 'LAC'
  };
  return abbr[teamId] || teamId.toUpperCase().slice(0, 3);
}

function getTeamConference(teamId) {
  const west = ['lakers', 'warriors', 'clippers', 'suns', 'kings', 
                'nuggets', 'thunder', 'timberwolves', 'blazers', 'jazz',
                'mavericks', 'rockets', 'grizzlies', 'pelicans', 'spurs'];
  return west.includes(teamId) ? 'West' : 'East';
}

function getTeamDivision(teamId) {
  const divisions = {
    Atlantic: ['celtics', 'nets', 'knicks', 'sixers', 'raptors'],
    Central: ['bulls', 'cavaliers', 'pistons', 'pacers', 'bucks'],
    Southeast: ['hawks', 'hornets', 'heat', 'magic', 'wizards'],
    Northwest: ['nuggets', 'thunder', 'timberwolves', 'blazers', 'jazz'],
    Pacific: ['lakers', 'warriors', 'clippers', 'suns', 'kings'],
    Southwest: ['mavericks', 'rockets', 'grizzlies', 'pelicans', 'spurs']
  };

  for (const [division, teams] of Object.entries(divisions)) {
    if (teams.includes(teamId)) return division;
  }

  return 'Unknown';
}

// ───────────────────────────────────────────────────────
// RUN IMPORT
// ───────────────────────────────────────────────────────

importRoster();