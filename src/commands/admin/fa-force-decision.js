// ═══════════════════════════════════════════════════════
// FA FORCE DECISION - Admin command to bypass 48h timer
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getPlayer, getPlayerOffers } = require('../../services/freeAgentService');
const { decideFreeAgent } = require('../../services/faDecisionService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fa-force-decision')
    .setDescription('Force free agent decision (Admin only - bypass 48h timer)')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('Season')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('player_id')
        .setDescription('Player ID (e.g., russell_westbrook)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const season = interaction.options.getString('season');
    const playerId = interaction.options.getString('player_id');
    
    try {
      // Get player
      const player = await getPlayer(season, playerId);
      
      if (!player) {
        return interaction.editReply({
          content: `❌ Player not found: \`${playerId}\``
        });
      }
      
      // Get offers
      const offers = await getPlayerOffers(season, playerId);
      
      if (offers.length === 0) {
        return interaction.editReply({
          content: `❌ **No pending offers for ${player.name}**`
        });
      }
      
      // Force decision
      await interaction.editReply({
        content: `⏳ Processing decision for **${player.name}**...\n\n` +
          `Evaluating ${offers.length} offer(s)...`
      });
      
      const result = await decideFreeAgent(player, offers, interaction.guild);
      
      // Result embed
      const embed = new EmbedBuilder()
        .setColor(result.decision === 'accept' ? 0x00FF00 : 0xFF0000)
        .setTitle(`⚖️ FORCED DECISION: ${player.name}`)
        .setDescription(`Admin: ${interaction.user.tag}`)
        .addFields(
          { name: '🏀 Player', value: `${player.name}\n${player.role} • OVR ${player.overall}`, inline: true },
          { name: '📊 Offers Evaluated', value: offers.length.toString(), inline: true }
        );
      
      if (result.decision === 'accept') {
        embed.addFields(
          { name: '✅ Decision', value: `Accepted offer from **${result.winning_team}**`, inline: false },
          { name: '💰 Contract', value: `${result.contract.years}yr / $${(result.contract.annual_salary / 1000000).toFixed(1)}M per year`, inline: true },
          { name: '📈 Score', value: result.score.toFixed(1), inline: true }
        );
      } else {
        embed.addFields(
          { name: '❌ Decision', value: 'Rejected all offers', inline: false },
          { name: '📝 Reason', value: result.reason || 'No satisfactory offers', inline: false }
        );
      }
      
      await interaction.editReply({
        content: null,
        embeds: [embed]
      });
      
      console.log(`⚡ Admin ${interaction.user.tag} forced decision for ${player.name}: ${result.decision}`);
      
    } catch (error) {
      console.error('Error forcing decision:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      });
    }
  }
};