// ═══════════════════════════════════════════════════════
// ADMIN COMMAND: REMOVE PLAYER
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { collections } = require('../../database/firebase');

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-player')
    .setDescription('Remove a player from the database (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    
    .addStringOption(option =>
      option.setName('player')
        .setDescription('Player name (start typing to search)')
        .setRequired(true)
        .setAutocomplete(true)),

  // ───────────────────────────────────────────────────────
  // AUTOCOMPLETE
  // ───────────────────────────────────────────────────────

  async autocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      
      // Get all players
      const playersSnapshot = await collections.players().get();
      
      const players = [];
      playersSnapshot.forEach(doc => {
        const data = doc.data();
        players.push({
          name: data.name,
          id: doc.id,
          team: data.current_team || 'FA'
        });
      });

      // Filter by search term
      const filtered = players
        .filter(p => p.name.toLowerCase().includes(focusedValue))
        .slice(0, 25) // Discord limit
        .map(p => ({
          name: `${p.name} (${p.team.toUpperCase()})`,
          value: p.id
        }));

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

      const playerId = interaction.options.getString('player');

      // Get player data
      const playerDoc = await collections.players().doc(playerId).get();
      
      if (!playerDoc.exists) {
        return await interaction.editReply({
          content: `❌ Player with ID \`${playerId}\` not found!`,
        });
      }

      const player = { id: playerDoc.id, ...playerDoc.data() };
      const teamId = player.current_team;

      // Remove from team roster
      if (teamId && teamId !== 'free_agent') {
        const teamDoc = await collections.teams().doc(teamId).get();
        
        if (teamDoc.exists) {
          const teamData = teamDoc.data();
          
          // Remove from standard roster
          teamData.roster.standard = teamData.roster.standard.filter(
            p => p.player_id !== playerId
          );
          
          // Remove from two-way roster
          teamData.roster.two_way = teamData.roster.two_way.filter(
            p => p.player_id !== playerId
          );
          
          await collections.teams().doc(teamId).update({
            roster: teamData.roster
          });
        }
      }

      // Delete player from database
      await collections.players().doc(playerId).delete();

      await interaction.editReply({
        content: `✅ **Player Removed!**\n\n` +
                 `👤 **${player.name}**\n` +
                 `📊 Age: ${player.age} | Overall: ${player.overall}\n` +
                 `🏀 Was on: **${teamId ? teamId.toUpperCase() : 'Free Agent'}**\n\n` +
                 `${teamId ? `💡 Use \`/admin initialize-roster team:${teamId}\` to update the roster display!` : ''}`,
      });

    } catch (error) {
      console.error('Error removing player:', error);
      
      await interaction.editReply({
        content: `❌ Error removing player: ${error.message}`,
      });
    }
  }
};