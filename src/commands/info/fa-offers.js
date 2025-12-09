// ═══════════════════════════════════════════════════════
// FA VIEW OFFERS COMMAND - View team's FA offers
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTeamOffers } = require('../../services/freeAgentService');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fa-offers')
    .setDescription('View your team\'s Free Agent offers')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('Season')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Filter by status')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Pending', value: 'pending' },
          { name: 'Accepted', value: 'accepted' },
          { name: 'Rejected', value: 'rejected' }
        )),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const season = interaction.options.getString('season') || '2025';
    const statusFilter = interaction.options.getString('status') || 'all';
    
    try {
      const db = admin.firestore();
      
      // Get user's team
      const teamId = await getUserTeam(interaction.user.id, db);
      
      if (!teamId) {
        return interaction.editReply({
          content: '❌ **You are not assigned to a team!**'
        });
      }
      
      // Get team data
      const teamDoc = await db.collection('teams').doc(teamId).get();
      const team = teamDoc.data();
      
      // Get offers
      const allOffers = await getTeamOffers(season, teamId, statusFilter === 'all' ? null : statusFilter);
      
      if (allOffers.length === 0) {
        return interaction.editReply({
          content: `📋 **No offers found**\n\nYour team has no ${statusFilter === 'all' ? '' : statusFilter} offers.`
        });
      }
      
      // Group by status
      const pending = allOffers.filter(o => o.status === 'pending');
      const accepted = allOffers.filter(o => o.status === 'accepted');
      const rejected = allOffers.filter(o => o.status === 'rejected');
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x1D428A)
        .setTitle(`📋 ${team.name.toUpperCase()} - FA OFFERS`)
        .setDescription(`**Season:** ${season}\n**Total Offers:** ${allOffers.length}`)
        .addFields(
          { name: '📊 Summary', value: `🟡 Pending: ${pending.length}\n✅ Accepted: ${accepted.length}\n❌ Rejected: ${rejected.length}`, inline: false }
        );
      
      // Add pending offers
      if (pending.length > 0 && (statusFilter === 'all' || statusFilter === 'pending')) {
        let pendingList = '';
        pending.slice(0, 10).forEach(offer => {
          const expiresAt = offer.expires_at.toDate();
          const hoursRemaining = Math.round((expiresAt - new Date()) / (1000 * 60 * 60));
          
          pendingList += `**${offer.player_name}**\n`;
          pendingList += `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M per year\n`;
          pendingList += `Expires: <t:${Math.floor(expiresAt.getTime() / 1000)}:R> (${hoursRemaining}h)\n`;
          pendingList += `Funding: ${offer.contract.funding.toUpperCase()}\n\n`;
        });
        
        if (pending.length > 10) {
          pendingList += `... and ${pending.length - 10} more`;
        }
        
        embed.addFields({ name: '🟡 PENDING OFFERS', value: pendingList });
      }
      
      // Add accepted offers
      if (accepted.length > 0 && (statusFilter === 'all' || statusFilter === 'accepted')) {
        let acceptedList = '';
        accepted.slice(0, 5).forEach(offer => {
          const decidedAt = offer.decided_at?.toDate();
          const timeAgo = decidedAt ? Math.round((new Date() - decidedAt) / (1000 * 60 * 60 * 24)) : 0;
          
          acceptedList += `✅ **${offer.player_name}**\n`;
          acceptedList += `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M\n`;
          acceptedList += `Signed ${timeAgo}d ago\n\n`;
        });
        
        if (accepted.length > 5) {
          acceptedList += `... and ${accepted.length - 5} more`;
        }
        
        embed.addFields({ name: '✅ ACCEPTED', value: acceptedList });
      }
      
      // Add rejected offers
      if (rejected.length > 0 && (statusFilter === 'all' || statusFilter === 'rejected')) {
        let rejectedList = '';
        rejected.slice(0, 5).forEach(offer => {
          rejectedList += `❌ **${offer.player_name}**\n`;
          rejectedList += `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M\n`;
          if (offer.decision_reason) {
            rejectedList += `Reason: ${offer.decision_reason}\n`;
          }
          rejectedList += '\n';
        });
        
        if (rejected.length > 5) {
          rejectedList += `... and ${rejected.length - 5} more`;
        }
        
        embed.addFields({ name: '❌ REJECTED', value: rejectedList });
      }
      
      // Add cap info
      const pendingTotal = team.salary_cap?.pending_offers?.total || 0;
      embed.addFields({
        name: '💰 Cap Impact',
        value: `Pending Offers: $${(pendingTotal / 1000000).toFixed(1)}M\nAvailable Cap: $${((team.salary_cap?.available_cap || 0) / 1000000).toFixed(1)}M`
      });
      
      await interaction.editReply({
        embeds: [embed]
      });
      
    } catch (error) {
      console.error('Error fetching offers:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      });
    }
  }
};

async function getUserTeam(userId, db) {
  const teamsSnapshot = await db.collection('teams').get();
  
  for (const teamDoc of teamsSnapshot.docs) {
    const team = teamDoc.data();
    if (team.discord?.gm_id === userId || team.discord?.co_gm_ids?.includes(userId)) {
      return teamDoc.id;
    }
  }
  
  return null;
}