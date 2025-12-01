// ═══════════════════════════════════════════════════════
// ADMIN COMMAND: INITIALIZE SINGLE ROSTER
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { collections } = require('../../database/firebase');
const { generateRosterMessage } = require('../../services/rosterDisplayService');

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

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('initialize-roster')
    .setDescription('Initialize/update roster message for a single team (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Team to initialize')
        .setRequired(true)
        .setAutocomplete(true)),

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

      const teamId = interaction.options.getString('team');
      const teamName = NBA_TEAMS.find(t => t.value === teamId)?.name || teamId;

      // Get team data from database
      const teamDoc = await collections.teams().doc(teamId).get();
      
      if (!teamDoc.exists) {
        return await interaction.editReply({
          content: `❌ Team **${teamName}** not found in database!`,
        });
      }

      const team = { id: teamDoc.id, ...teamDoc.data() };

      // Find the team's HQ channel (search without emoji dependency)
      const channel = interaction.guild.channels.cache.find(
        ch => ch.name.endsWith(`-${teamId}-hq`)
      );

      if (!channel) {
        return await interaction.editReply({
          content: `❌ Channel for **${teamName}** not found!\n\nMake sure the server was set up with \`/setup\` first.\nLooking for channel ending with: \`-${teamId}-hq\``,
        });
      }

      // Generate roster message
      const message = await generateRosterMessage(teamId);

      // Check if there's already a roster message saved
      const existingMessageId = team.discord?.roster_message_id;

      if (existingMessageId) {
        // Try to update existing message
        try {
          const existingMessage = await channel.messages.fetch(existingMessageId);
          await existingMessage.edit(message);
          
          return await interaction.editReply({
            content: `✅ **Roster Updated!**\n\n` +
                     `Team: **${teamName}**\n` +
                     `Channel: ${channel}\n` +
                     `Updated existing message`,
          });
        } catch (error) {
          // Message doesn't exist anymore, create new one
          console.log(`Previous roster message not found for ${teamId}, creating new one`);
        }
      }

      // Send new message
      const sentMessage = await channel.send(message);

      // Save message ID to database
      await collections.teams().doc(teamId).update({
        'discord.roster_message_id': sentMessage.id
      });

      await interaction.editReply({
        content: `✅ **Roster Initialized!**\n\n` +
                 `Team: **${teamName}**\n` +
                 `Channel: ${channel}\n` +
                 `Message: ${sentMessage.url}`,
      });

    } catch (error) {
      console.error('Error initializing roster:', error);
      
      await interaction.editReply({
        content: `❌ Error initializing roster: ${error.message}`,
      });
    }
  }
};