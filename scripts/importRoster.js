// ═══════════════════════════════════════════════════════
// IMPORT ROSTER FROM EXCEL - IBA LEAGUE FORMAT
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { initializeDatabase, collections, admin } = require('../src/database/firebase');

// ───────────────────────────────────────────────────────
// CONFIGURATION
// ───────────────────────────────────────────────────────

const EXCEL_PATH = path.join(__dirname, '../data/Iba_League.xlsx');
const BATCH_SIZE = 500;

const SEASONS = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];

// ───────────────────────────────────────────────────────
// MAIN IMPORT FUNCTION
// ───────────────────────────────────────────────────────

async function importRoster() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🏀 NBA FANTASY LEAGUE - ROSTER IMPORT (EXCEL)');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Initialize database
    console.log('📊 Connecting to database...');
    await initializeDatabase();
    console.log('✅ Database connected\n');

    // Load Excel file
    console.log('📄 Loading Excel file...');
    const workbook = XLSX.readFile(EXCEL_PATH);
    console.log(`✅ Loaded workbook with ${workbook.SheetNames.length} sheets\n`);

    const allPlayers = [];
    const allTeams = {};
    let totalPlayers = 0;

    // Process each team sheet
    console.log('🏀 Processing team sheets...\n');
    
    for (const sheetName of workbook.SheetNames) {
      // Skip non-team sheets
      if (sheetName === 'Backup Registry' || sheetName === 'Free Agents 2025') {
        continue;
      }

      console.log(`   📋 Processing: ${sheetName}...`);
      
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      if (data.length === 0) {
        console.log(`      ⚠️  Empty sheet, skipping`);
        continue;
      }

      // Get team ID
      const teamId = normalizeTeamName(sheetName);
      
      // Initialize team
      if (!allTeams[teamId]) {
        allTeams[teamId] = initializeTeam(sheetName, teamId);
      }

      // Process players
      let playerCount = 0;
      for (const row of data) {
        if (!row.Name) continue; // Skip empty rows
        
        const player = createPlayerFromRow(row, teamId, sheetName);
        
        if (player) {
          allPlayers.push(player);
          allTeams[teamId].roster.standard.push({
            player_id: player.id,
            acquired_date: '2025-10-01',
            acquired_via: 'initial_roster',
          });
          playerCount++;
        }
      }

      console.log(`      ✅ ${playerCount} giocatori`);
      totalPlayers += playerCount;
    }

    console.log(`\n✅ Total teams processed: ${Object.keys(allTeams).length}`);
    console.log(`✅ Total players processed: ${totalPlayers}\n`);

    // Process Free Agents
    console.log('👥 Processing Free Agents 2025...\n');
    const freeAgents = processFreeAgents(workbook);
    console.log(`✅ Processed ${freeAgents.length} free agents\n`);

    // Add free agents to allPlayers
    allPlayers.push(...freeAgents);

    // Import to database
    console.log('📤 Importing to database...\n');

    // Import teams
    console.log('📋 Importing teams...');
    await importTeams(allTeams);
    console.log(`✅ Imported ${Object.keys(allTeams).length} teams\n`);

    // Import players
    console.log('👥 Importing players...');
    await importPlayers(allPlayers);
    console.log(`✅ Imported ${allPlayers.length} players\n`);

    // Initialize season
    console.log('📅 Initializing season 2025-26...');
    await initializeSeason();
    console.log('✅ Season initialized\n');

    // Create Free Agency collection
    console.log('🆓 Setting up Free Agency 2025-26...');
    await setupFreeAgency(freeAgents);
    console.log('✅ Free Agency setup complete\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ IMPORT COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\n📊 SUMMARY:`);
    console.log(`   • Teams: ${Object.keys(allTeams).length}`);
    console.log(`   • Players with contracts: ${totalPlayers}`);
    console.log(`   • Free Agents: ${freeAgents.length}`);
    console.log(`   • Total players: ${allPlayers.length}\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ IMPORT FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────
// TEAM HELPERS
// ───────────────────────────────────────────────────────

function normalizeTeamName(fullName) {
  // "Atlanta Hawks" → "hawks"
  // "Los Angeles Lakers" → "lakers"
  const teamMap = {
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
    'Washington Wizards': 'wizards',
  };

  return teamMap[fullName] || fullName.toLowerCase().split(' ').pop();
}

function initializeTeam(fullName, teamId) {
  return {
    _id: teamId,
    name: fullName,
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
    draft_picks: {},
    
    gm: null,
    waiver_priority: 0,
  };
}

// ───────────────────────────────────────────────────────
// PLAYER CREATION
// ───────────────────────────────────────────────────────

function createPlayerFromRow(row, teamId, teamName) {
  try {
    // Generate player ID
    const playerId = row.Name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');

    // Parse contract
    const contract = {};
    
    for (let i = 0; i < SEASONS.length; i++) {
      const season = SEASONS[i];
      const salaryValue = row[season];
      
      if (!salaryValue) {
        // No value = UFA
        contract[season] = {
          salary: 0,
          status: 'UFA'
        };
      } else if (typeof salaryValue === 'string') {
        const salaryStr = salaryValue.toLowerCase().trim();
        
        if (salaryStr === 'player option') {
          // Player option - use salary from previous year
          const prevSeason = SEASONS[i - 1];
          const prevSalary = contract[prevSeason]?.salary || 0;
          
          contract[season] = {
            salary: prevSalary,
            guaranteed: false,
            player_option: true,
            team_option: false,
            status: 'option'
          };
        } else if (salaryStr === 'team option') {
          // Team option
          const prevSeason = SEASONS[i - 1];
          const prevSalary = contract[prevSeason]?.salary || 0;
          
          contract[season] = {
            salary: prevSalary,
            guaranteed: false,
            player_option: false,
            team_option: true,
            status: 'option'
          };
        } else if (salaryStr === 'rfa') {
          contract[season] = {
            salary: 0,
            status: 'RFA'
          };
        } else if (salaryStr === 'ufa') {
          contract[season] = {
            salary: 0,
            status: 'UFA'
          };
        } else {
          // Unknown string value, treat as UFA
          contract[season] = {
            salary: 0,
            status: 'UFA'
          };
        }
      } else if (typeof salaryValue === 'number') {
        // Numeric salary
        contract[season] = {
          salary: Math.round(salaryValue),
          guaranteed: true,
          player_option: false,
          team_option: false,
          status: 'signed'
        };
      }
    }

    // Determine contract type (standard or two-way)
    const contractType = (row.Ovr && row.Ovr < 70) ? 'two_way' : 'standard';

    return {
      id: playerId,
      name: row.Name,
      
      position: row.Pos || 'F',
      age: Math.round(row.Age) || 25,
      overall: Math.round(row.Ovr) || 70,
      experience_years: Math.round(row.Exp) || 0,
      
      current_team: teamId,
      contract_type: contractType,
      
      contract: contract,
      
      bird_rights: {
        years: Math.round(row.Bird) || 0,
        status: getBirdRightsStatus(Math.round(row.Bird) || 0),
        acquired_date: '2023-10-01'
      },
      
      personality: {
        loyalty: Math.round(row.Fed) || 50,
        money_importance: Math.round(row.Sal) || 50,
        win_desire: Math.round(row.Win) || 50
      },
      
      draft_pick_info: row.Pick || null,
    };

  } catch (error) {
    console.error(`      ⚠️  Error processing player: ${row.Name}`, error.message);
    return null;
  }
}

function getBirdRightsStatus(years) {
  if (years >= 3) return 'full';
  if (years === 2) return 'early';
  if (years === 1) return 'non';
  return 'none';
}

// ───────────────────────────────────────────────────────
// FREE AGENTS PROCESSING
// ───────────────────────────────────────────────────────

function processFreeAgents(workbook) {
  const sheet = workbook.Sheets['Free Agents 2025'];
  if (!sheet) {
    console.log('   ⚠️  No Free Agents sheet found');
    return [];
  }

  const data = XLSX.utils.sheet_to_json(sheet);
  const freeAgents = [];

  for (const row of data) {
    if (!row.Nome) continue;

    const playerId = row.Nome
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');

    // Create contract with UFA status for all years
    const contract = {};
    for (const season of SEASONS) {
      contract[season] = {
        salary: 0,
        status: 'UFA'
      };
    }

    const player = {
      id: playerId,
      name: row.Nome,
      
      position: row.Ruolo || 'F',
      age: Math.round(row['Età']) || 25,
      overall: Math.round(row.Overall) || 70,
      experience_years: Math.round(row.Esperienza) || 0,
      
      current_team: null,
      contract_type: 'standard',
      
      contract: contract,
      
      bird_rights: {
        years: 0,
        status: 'none',
        acquired_date: null
      },
      
      personality: {
        loyalty: Math.round(row['Fedeltà']) || 50,
        money_importance: Math.round(row['Money Imp']) || 50,
        win_desire: Math.round(row['Win Imp']) || 50
      },
      
      team_interest: row['Gradimento Team'] || null,
      notes: row.Note || null,
    };

    freeAgents.push(player);
  }

  return freeAgents;
}

// ───────────────────────────────────────────────────────
// DATABASE IMPORT
// ───────────────────────────────────────────────────────

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

    if (operationCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = admin.firestore().batch();
      operationCount = 0;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`   • Processed ${i + 1}/${players.length} players`);
    }
  }

  if (operationCount > 0) {
    batches.push(currentBatch);
  }

  console.log(`   • Committing ${batches.length} batch(es)...`);

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
    
    salary_cap: 154647000,
    luxury_tax: 187895000,
    first_apron: 195945000,
    second_apron: 207824000,
    
    trade_deadline: null,
    schedule_format: 58,
    
    started_at: null,
    ended_at: null,
  };

  await collections.seasons().doc('2025-26').set(seasonData);
}

async function setupFreeAgency(freeAgents) {
  const faData = {
    id: 'fa_2025_26',
    year: 2026,
    status: 'not_started',
    mode: 'journeys',
    
    current_journey: null,
    
    free_agents: freeAgents.map(fa => ({
      player_id: fa.id,
      type: 'UFA',
      status: 'available',
      original_team: null,
      offers: []
    })),
    
    statistics: {
      total_fas: freeAgents.length,
      ufas: freeAgents.length,
      rfas: 0,
      signed: 0,
      remaining: freeAgents.length
    }
  };

  await collections.freeAgency().doc('fa_2025_26').set(faData);
}

// ───────────────────────────────────────────────────────
// TEAM DATA
// ───────────────────────────────────────────────────────

function getTeamAbbreviation(teamId) {
  const abbr = {
    hawks: 'ATL', celtics: 'BOS', nets: 'BKN', hornets: 'CHA',
    bulls: 'CHI', cavaliers: 'CLE', mavericks: 'DAL', nuggets: 'DEN',
    pistons: 'DET', warriors: 'GSW', rockets: 'HOU', pacers: 'IND',
    clippers: 'LAC', lakers: 'LAL', grizzlies: 'MEM', heat: 'MIA',
    bucks: 'MIL', timberwolves: 'MIN', pelicans: 'NOP', knicks: 'NYK',
    thunder: 'OKC', magic: 'ORL', sixers: 'PHI', suns: 'PHX',
    blazers: 'POR', kings: 'SAC', spurs: 'SAS', raptors: 'TOR',
    jazz: 'UTA', wizards: 'WAS'
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