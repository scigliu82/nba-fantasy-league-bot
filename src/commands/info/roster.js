// ═══════════════════════════════════════════════════════
// ROSTER COMMAND - View team roster
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder } = require('discord.js');
const { collections } = require('../../database/firebase');
const { generateRosterMessage } = require('../../services/rosterDisplayService');

const TEAMS = {
  hawks: 'Atlanta Hawks',
  celtics: 'Boston Celtics',
  nets: 'Brooklyn Nets',
  hornets: 'Charlotte Hornets',
  bulls: 'Chicago Bulls',
  cavaliers: 'Cleveland Cavaliers',
  mavericks: 'Dallas Mavericks',
  nuggets: 'Denver Nuggets',
  pistons: 'Detroit Pistons',
  warriors: 'Golden State Warriors',
  rockets: 'Houston Rockets',
  pacers: 'Indiana Pacers',
  clippers: 'LA Clippers',
  lakers: 'Los Angeles Lakers',
  grizzlies: 'Memphis Grizzlies',
  heat: 'Miami Heat',
  bucks: 'Milwaukee Bucks',
  timberwolves: 'Minnesota Timberwolves',
  pelicans: 'New Orleans Pelicans',
  knicks: 'New York Knicks',
  thunder: 'Oklahoma City Thunder',
  magic: 'Orlando Magic',
  sixers: 'Philadelphia 76ers',
  suns: 'Phoenix Suns',
  blazers: 'Portland Trail Blazers',
  kings: 'Sacramento Kings',
  spurs: 'San Antonio Spurs',
  raptors: 'Toronto Raptors',
  jazz: 'Utah Jazz',
  wizards: 'Washington Wizards'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('View team roster')
    .addStringOption(option =>
      option
        .setName('team')
        .setDescription('Team to view (leave empty for your team)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    
    const filtered = Object.entries(TEAMS)
      .filter(([id, name]) => 
        name.toLowerCase().includes(focusedValue) || 
        id.includes(focusedValue)
      )
      .slice(0, 25)
      .map(([id, name]) => ({ name, value: id }));
    
    await interaction.respond(filtered);
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const requestedTeam = interaction.options.getString('team');
      let teamId = requestedTeam;

      // If no team specified, try to find user's team from roles
      if (!teamId) {
        teamId = await findUserTeam(interaction.member);
        
        if (!teamId) {
          return await interaction.editReply({
            content: '❌ You are not assigned to any team. Use `/roster team:<team_name>` to view a specific team.',
            ephemeral: true
          });
        }
      }

      // Generate roster message
      const rosterMessage = await generateRosterMessage(teamId);

      // Send roster
      await interaction.editReply({
        ...rosterMessage,
        ephemeral: true
      });

    } catch (error) {
      console.error('Error showing roster:', error);
      await interaction.editReply({
        content: `❌ Error loading roster: ${error.message}`,
        ephemeral: true
      });
    }
  },
};

// ───────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ───────────────────────────────────────────────────────

async function findUserTeam(member) {
  const roleNames = member.roles.cache.map(role => role.name.toLowerCase());
  
  const teamMapping = {
    'gm-hawks': 'hawks',
    'gm-celtics': 'celtics',
    'gm-nets': 'nets',
    'gm-hornets': 'hornets',
    'gm-bulls': 'bulls',
    'gm-cavaliers': 'cavaliers',
    'gm-mavericks': 'mavericks',
    'gm-nuggets': 'nuggets',
    'gm-pistons': 'pistons',
    'gm-warriors': 'warriors',
    'gm-rockets': 'rockets',
    'gm-pacers': 'pacers',
    'gm-clippers': 'clippers',
    'gm-lakers': 'lakers',
    'gm-grizzlies': 'grizzlies',
    'gm-heat': 'heat',
    'gm-bucks': 'bucks',
    'gm-timberwolves': 'timberwolves',
    'gm-pelicans': 'pelicans',
    'gm-knicks': 'knicks',
    'gm-thunder': 'thunder',
    'gm-magic': 'magic',
    'gm-76ers': 'sixers',
    'gm-suns': 'suns',
    'gm-blazers': 'blazers',
    'gm-kings': 'kings',
    'gm-spurs': 'spurs',
    'gm-raptors': 'raptors',
    'gm-jazz': 'jazz',
    'gm-wizards': 'wizards'
  };

  for (const roleName of roleNames) {
    if (teamMapping[roleName]) {
      return teamMapping[roleName];
    }
  }

  return null;
}