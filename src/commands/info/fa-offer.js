// ═══════════════════════════════════════════════════════
// FA OFFER COMMAND - Make Free Agent Offer
// 3-step process: Group → Player → Contract
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAvailablePlayers, getPlayersInGroup, ALPHABET_GROUPS, getMinimumSalary, createOffer, getPlayer } = require('../../services/freeAgentService');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fa-offer')
    .setDescription('Make a Free Agent offer')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('Season')
        .setRequired(false)),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const season = interaction.options.getString('season') || '2025';
    const db = admin.firestore();
    
    try {
      // Get user's team
      const teamId = await getUserTeam(interaction.user.id, db);
      
      if (!teamId) {
        return interaction.editReply({
          content: '❌ **You are not assigned to a team!**\n\nPlease contact an admin.'
        });
      }
      
      // Get team data
      const teamDoc = await db.collection('teams').doc(teamId).get();
      
      if (!teamDoc.exists) {
        return interaction.editReply({
          content: '❌ **Team not found in database!**'
        });
      }
      
      const team = teamDoc.data();
      
      // Get available players
      const players = await getAvailablePlayers(season, {});
      
      if (players.length === 0) {
        return interaction.editReply({
          content: '❌ **No free agents available!**'
        });
      }
      
      // STEP 1: Select alphabetical group
      const groupSelect = new StringSelectMenuBuilder()
        .setCustomId(`fa_offer_group_${season}_${teamId}`)
        .setPlaceholder('📝 Select alphabetical group')
        .addOptions(
          ALPHABET_GROUPS.map(group => ({
            label: `${group.label}`,
            description: `Players starting with ${group.label}`,
            value: group.id
          }))
        );
      
      const row = new ActionRowBuilder().addComponents(groupSelect);
      
      const embed = new EmbedBuilder()
        .setColor(0x1D428A)
        .setTitle('✍️ MAKE FREE AGENT OFFER')
        .setDescription(
          `**Step 1/3:** Select alphabetical group\n\n` +
          `**Team:** ${team.name}\n` +
          `**Cap Space:** $${(team.salary_cap?.cap_space || 0) / 1000000}M\n` +
          `**Available Cap:** $${(team.salary_cap?.available_cap || 0) / 1000000}M`
        )
        .addFields({
          name: '📋 Groups',
          value: ALPHABET_GROUPS.map(g => `• ${g.label}`).join('\n')
        });
      
      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
      
    } catch (error) {
      console.error('Error in fa-offer:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      });
    }
  }
};

async function getUserTeam(userId, db) {
  // Check teams collection for user assignment
  const teamsSnapshot = await db.collection('teams').get();
  
  for (const teamDoc of teamsSnapshot.docs) {
    const team = teamDoc.data();
    if (team.discord?.gm_id === userId || team.discord?.co_gm_ids?.includes(userId)) {
      return teamDoc.id;
    }
  }
  
  return null;
}