// ═══════════════════════════════════════════════════════
// ADMIN COMMAND: ADD PLAYER
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { collections } = require('../../database/firebase');

// ───────────────────────────────────────────────────────
// TEAM DATA
// ───────────────────────────────────────────────────────

const NBA_TEAMS = [
  { name: 'Atlanta Hawks', value: 'hawks' },
  { name: 'Boston Celtics', value: 'celtics' },
  { name: 'Brooklyn Nets', value: 'nets' },
  { name: 'Charlotte Hornets', value: 'hornets' },
  { name: 'Chicago Bulls', value: 'bulls' },
  { name: 'Cleveland Cavaliers', value: 'cavaliers' },
  { name: 'Dallas Mavericks', value: 'mavericks' },
  { name: 'Denver Nuggets', value: 'nuggets' },
  { name: 'Detroit Pistons', value: 'pistons' },
  { name: 'Golden State Warriors', value: 'warriors' },
  { name: 'Houston Rockets', value: 'rockets' },
  { name: 'Indiana Pacers', value: 'pacers' },
  { name: 'Los Angeles Clippers', value: 'clippers' },
  { name: 'Los Angeles Lakers', value: 'lakers' },
  { name: 'Memphis Grizzlies', value: 'grizzlies' },
  { name: 'Miami Heat', value: 'heat' },
  { name: 'Milwaukee Bucks', value: 'bucks' },
  { name: 'Minnesota Timberwolves', value: 'timberwolves' },
  { name: 'New Orleans Pelicans', value: 'pelicans' },
  { name: 'New York Knicks', value: 'knicks' },
  { name: 'Oklahoma City Thunder', value: 'thunder' },
  { name: 'Orlando Magic', value: 'magic' },
  { name: 'Philadelphia 76ers', value: 'sixers' },
  { name: 'Phoenix Suns', value: 'suns' },
  { name: 'Portland Trail Blazers', value: 'blazers' },
  { name: 'Sacramento Kings', value: 'kings' },
  { name: 'San Antonio Spurs', value: 'spurs' },
  { name: 'Toronto Raptors', value: 'raptors' },
  { name: 'Utah Jazz', value: 'jazz' },
  { name: 'Washington Wizards', value: 'wizards' }
];

const POSITIONS = [
  { name: 'Point Guard (PM)', value: 'PM' },
  { name: 'Guard (G)', value: 'G' },
  { name: 'Small Forward (AG)', value: 'AG' },
  { name: 'Forward (AP)', value: 'AP' },
  { name: 'Center (C)', value: 'C' },
  { name: 'Guard/Forward (G / AP)', value: 'G / AP' },
  { name: 'Forward/Center (AG / C)', value: 'AG / C' }
];

const CONTRACT_OPTIONS = [
  { name: 'None', value: 'none' },
  { name: 'Player Option', value: 'player_option' },
  { name: 'Team Option', value: 'team_option' }
];

const SEASONS = [
  { name: '2025-26', value: '2025-26' },
  { name: '2026-27', value: '2026-27' },
  { name: '2027-28', value: '2027-28' },
  { name: '2028-29', value: '2028-29' },
  { name: '2029-30', value: '2029-30' },
  { name: '2030-31', value: '2030-31' }
];

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-player')
    .setDescription('Add a player to a team (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    
    // Basic info
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Player full name (e.g., "LeBron James")')
        .setRequired(true))
    
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Team to add player to')
        .setRequired(true)
        .setAutocomplete(true))
    
    .addStringOption(option =>
      option.setName('position')
        .setDescription('Player position')
        .setRequired(true)
        .addChoices(...POSITIONS))
    
    .addIntegerOption(option =>
      option.setName('age')
        .setDescription('Player age')
        .setRequired(true)
        .setMinValue(18)
        .setMaxValue(45))
    
    .addIntegerOption(option =>
      option.setName('overall')
        .setDescription('Player overall rating (60-99)')
        .setRequired(true)
        .setMinValue(60)
        .setMaxValue(99))
    
    // Contract - Year 1 (2025-26)
    .addIntegerOption(option =>
      option.setName('salary_2025_26')
        .setDescription('Salary for 2025-26 (0 = UFA)')
        .setRequired(true)
        .setMinValue(0))
    
    // Contract - Year 2 (2026-27)
    .addIntegerOption(option =>
      option.setName('salary_2026_27')
        .setDescription('Salary for 2026-27 (0 = UFA)')
        .setRequired(false)
        .setMinValue(0))
    
    // Contract - Year 3 (2027-28)
    .addIntegerOption(option =>
      option.setName('salary_2027_28')
        .setDescription('Salary for 2027-28 (0 = UFA)')
        .setRequired(false)
        .setMinValue(0))
    
    // Contract - Year 4 (2028-29)
    .addIntegerOption(option =>
      option.setName('salary_2028_29')
        .setDescription('Salary for 2028-29 (0 = UFA)')
        .setRequired(false)
        .setMinValue(0))
    
    // Contract - Year 5 (2029-30)
    .addIntegerOption(option =>
      option.setName('salary_2029_30')
        .setDescription('Salary for 2029-30 (0 = UFA)')
        .setRequired(false)
        .setMinValue(0))
    
    // Contract - Year 6 (2030-31)
    .addIntegerOption(option =>
      option.setName('salary_2030_31')
        .setDescription('Salary for 2030-31 (0 = UFA)')
        .setRequired(false)
        .setMinValue(0))
    
    // Contract option
    .addStringOption(option =>
      option.setName('contract_option')
        .setDescription('Does player have an option?')
        .setRequired(false)
        .addChoices(...CONTRACT_OPTIONS))
    
    .addStringOption(option =>
      option.setName('option_year')
        .setDescription('Which year is the option? (only if contract_option is set)')
        .setRequired(false)
        .addChoices(...SEASONS)),

  // ───────────────────────────────────────────────────────
  // AUTOCOMPLETE
  // ───────────────────────────────────────────────────────

  async autocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      
      // Filter teams by search term
      const filtered = NBA_TEAMS
        .filter(team => team.name.toLowerCase().includes(focusedValue))
        .slice(0, 25) // Discord limit
        .map(team => ({ name: team.name, value: team.value }));

      await interaction.respond(filtered);
    } catch (error) {
      console.error('Autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  // ───────────────────────────────────────────────────────
  // COMMAND EXECUTION
  // ───────────────────────────────────────────────────────

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Get parameters
      const name = interaction.options.getString('name');
      const teamId = interaction.options.getString('team');
      const position = interaction.options.getString('position');
      const age = interaction.options.getInteger('age');
      const overall = interaction.options.getInteger('overall');
      
      // Get salary for each year
      const salaries = {
        '2025-26': interaction.options.getInteger('salary_2025_26') || 0,
        '2026-27': interaction.options.getInteger('salary_2026_27') || 0,
        '2027-28': interaction.options.getInteger('salary_2027_28') || 0,
        '2028-29': interaction.options.getInteger('salary_2028_29') || 0,
        '2029-30': interaction.options.getInteger('salary_2029_30') || 0,
        '2030-31': interaction.options.getInteger('salary_2030_31') || 0
      };

      const contractOption = interaction.options.getString('contract_option') || 'none';
      const optionYear = interaction.options.getString('option_year');

      // Validate option year if contract_option is set
      if (contractOption !== 'none' && !optionYear) {
        return await interaction.editReply({
          content: '❌ You must specify `option_year` when setting a contract option!',
        });
      }

      // Generate player ID
      const playerId = name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');

      // Check if player already exists
      const existingPlayer = await collections.players().doc(playerId).get();
      if (existingPlayer.exists) {
        return await interaction.editReply({
          content: `❌ Player **${name}** already exists in the database!\nID: \`${playerId}\`\n\nUse \`/admin remove-player\` first if you want to replace them.`,
        });
      }

      // Build contract object
      const contract = {};
      
      for (const [season, salary] of Object.entries(salaries)) {
        if (salary === 0) {
          // No salary = UFA
          contract[season] = {
            salary: 0,
            status: 'UFA'
          };
        } else {
          // Has salary
          const isOptionYear = (contractOption !== 'none' && optionYear === season);
          
          contract[season] = {
            salary: salary,
            guaranteed: !isOptionYear,
            player_option: (contractOption === 'player_option' && isOptionYear),
            team_option: (contractOption === 'team_option' && isOptionYear),
            status: isOptionYear ? 'option' : 'signed'
          };
        }
      }

      // Calculate experience years (rough estimate from age)
      const experienceYears = Math.max(0, age - 19);

      // Create player object
      const playerData = {
        id: playerId,
        name: name,
        
        position: position,
        age: age,
        overall: overall,
        experience_years: experienceYears,
        
        current_team: teamId,
        contract_type: 'standard',
        
        contract: contract,
        
        bird_rights: {
          years: 0,
          status: 'none',
          acquired_date: new Date().toISOString().split('T')[0]
        },
        
        personality: {
          loyalty: 50,
          money_importance: 50,
          win_desire: 50
        },
        
        draft_pick_info: null,
        created_manually: true,
        created_at: new Date().toISOString(),
        created_by: interaction.user.id
      };

      // Save to database
      await collections.players().doc(playerId).set(playerData);

      // Also add to team roster
      const teamDoc = await collections.teams().doc(teamId).get();
      if (teamDoc.exists) {
        const teamData = teamDoc.data();
        teamData.roster.standard.push({
          player_id: playerId,
          acquired_date: new Date().toISOString().split('T')[0],
          acquired_via: 'manual_add'
        });
        
        await collections.teams().doc(teamId).update({
          roster: teamData.roster
        });
      }

      // Format contract summary
      let contractSummary = '';
      for (const [season, data] of Object.entries(contract)) {
        if (data.salary > 0) {
          const salaryFormatted = `$${(data.salary / 1000000).toFixed(1)}M`;
          const optionFlag = data.player_option ? ' 🔸PO' : (data.team_option ? ' 🔹TO' : '');
          contractSummary += `\n• ${season}: ${salaryFormatted}${optionFlag}`;
        }
      }

      const teamName = NBA_TEAMS.find(t => t.value === teamId)?.name || teamId;

      await interaction.editReply({
        content: `✅ **Player Added Successfully!**\n\n` +
                 `👤 **${name}**\n` +
                 `📍 Position: ${position}\n` +
                 `📊 Age: ${age} | Overall: ${overall}\n` +
                 `🏀 Team: **${teamName}**\n` +
                 `📝 Contract:${contractSummary || ' None (UFA)'}\n\n` +
                 `💡 Use \`/admin initialize-roster team:${teamName}\` to update the roster display!`,
      });

    } catch (error) {
      console.error('Error adding player:', error);
      
      await interaction.editReply({
        content: `❌ Error adding player: ${error.message}`,
      });
    }
  }
};