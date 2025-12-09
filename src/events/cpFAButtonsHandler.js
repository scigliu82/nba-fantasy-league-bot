// ═══════════════════════════════════════════════════════
// CONTROL PANEL FA BUTTONS HANDLER
// Handles FA buttons clicks from team control panels
// ═══════════════════════════════════════════════════════

const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAvailablePlayers } = require('../services/freeAgentService');

const ITEMS_PER_PAGE = 15;

module.exports = {
  name: 'interactionCreate',
  
  async execute(interaction) {
    if (!interaction.isButton()) return;
    
    // Handle FA Market button
    if (interaction.customId.startsWith('cp_fa_market_')) {
      await handleFAMarket(interaction);
      return;
    }
    
    // Handle Make FA Offer button
    if (interaction.customId.startsWith('cp_make_fa_offer_')) {
      await handleMakeFAOffer(interaction);
      return;
    }
    
    // Handle View FA Offers button
    if (interaction.customId.startsWith('cp_view_fa_offers_')) {
      await handleViewFAOffers(interaction);
      return;
    }
    
    // Handle pagination buttons
    if (interaction.customId.startsWith('fa_market_')) {
      await handleMarketPagination(interaction);
      return;
    }
  }
};

async function handleFAMarket(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
  const season = '2025';
  
  try {
    // Get all available players
    const players = await getAvailablePlayers(season, { sort_by: 'overall' });
    
    if (players.length === 0) {
      return interaction.editReply({
        content: '❌ No free agents available!'
      });
    }
    
    // Pagination
    const page = 0;
    const totalPages = Math.ceil(players.length / ITEMS_PER_PAGE);
    
    // Generate embed
    const embed = generateMarketEmbed(players, page, totalPages, season);
    
    // Generate buttons
    const row = generatePaginationButtons(page, totalPages);
    
    await interaction.editReply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : []
    });
    
  } catch (error) {
    console.error('Error fetching FA market:', error);
    await interaction.editReply({
      content: `❌ Error fetching free agents: ${error.message}`
    });
  }
}

async function handleMakeFAOffer(interaction) {
  await interaction.reply({
    content: '✍️ **Make FA Offer**\n\nUse the command `/fa-offer` to make an offer to a free agent!',
    flags: MessageFlags.Ephemeral
  });
}

async function handleViewFAOffers(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
  // Get teamId from customId: cp_view_fa_offers_teamId
  const teamId = interaction.customId.split('_').pop();
  const season = '2025';
  
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    const { getTeamOffers } = require('../services/freeAgentService');
    
    // Get team data
    const teamDoc = await db.collection('teams').doc(teamId).get();
    
    if (!teamDoc.exists) {
      return interaction.editReply({
        content: '❌ Team not found!'
      });
    }
    
    const team = teamDoc.data();
    
    // Get all offers
    const allOffers = await getTeamOffers(season, teamId, null);
    
    if (allOffers.length === 0) {
      return interaction.editReply({
        content: `📋 **No offers found**\n\nYour team has no offers yet.\n\nUse \`/fa-offer\` to make your first offer!`
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
    if (pending.length > 0) {
      let pendingList = '';
      pending.slice(0, 5).forEach(offer => {
        const expiresAt = offer.expires_at.toDate();
        const hoursRemaining = Math.round((expiresAt - new Date()) / (1000 * 60 * 60));
        
        pendingList += `**${offer.player_name}**\n`;
        pendingList += `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M per year\n`;
        pendingList += `Expires: <t:${Math.floor(expiresAt.getTime() / 1000)}:R> (${hoursRemaining}h)\n`;
        pendingList += `Funding: ${offer.contract.funding.toUpperCase()}\n\n`;
      });
      
      if (pending.length > 5) {
        pendingList += `... and ${pending.length - 5} more`;
      }
      
      embed.addFields({ name: '🟡 PENDING OFFERS', value: pendingList });
    }
    
    // Add accepted offers
    if (accepted.length > 0) {
      let acceptedList = '';
      accepted.slice(0, 3).forEach(offer => {
        const decidedAt = offer.decided_at?.toDate();
        const timeAgo = decidedAt ? Math.round((new Date() - decidedAt) / (1000 * 60 * 60 * 24)) : 0;
        
        acceptedList += `✅ **${offer.player_name}**\n`;
        acceptedList += `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M\n`;
        acceptedList += `Signed ${timeAgo}d ago\n\n`;
      });
      
      if (accepted.length > 3) {
        acceptedList += `... and ${accepted.length - 3} more`;
      }
      
      embed.addFields({ name: '✅ ACCEPTED', value: acceptedList });
    }
    
    // Add rejected offers
    if (rejected.length > 0) {
      let rejectedList = '';
      rejected.slice(0, 3).forEach(offer => {
        rejectedList += `❌ **${offer.player_name}**\n`;
        rejectedList += `${offer.contract.years}yr / $${(offer.contract.annual_salary / 1000000).toFixed(1)}M\n`;
        if (offer.decision_reason) {
          rejectedList += `Reason: ${offer.decision_reason}\n`;
        }
        rejectedList += '\n';
      });
      
      if (rejected.length > 3) {
        rejectedList += `... and ${rejected.length - 3} more`;
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

async function handleMarketPagination(interaction) {
  await interaction.deferUpdate();
  
  const action = interaction.customId.split('_')[2];
  const currentPage = parseInt(interaction.customId.split('_')[3]);
  const season = '2025';
  
  try {
    // Get players
    const players = await getAvailablePlayers(season, { sort_by: 'overall' });
    const totalPages = Math.ceil(players.length / ITEMS_PER_PAGE);
    
    let newPage = currentPage;
    if (action === 'prev') newPage = Math.max(0, currentPage - 1);
    if (action === 'next') newPage = Math.min(totalPages - 1, currentPage + 1);
    if (action === 'first') newPage = 0;
    if (action === 'last') newPage = totalPages - 1;
    
    const embed = generateMarketEmbed(players, newPage, totalPages, season);
    const row = generatePaginationButtons(newPage, totalPages);
    
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
    
  } catch (error) {
    console.error('Error paginating FA market:', error);
  }
}

function generateMarketEmbed(players, page, totalPages, season) {
  const start = page * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = players.slice(start, end);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🏀 FREE AGENT MARKET ${season}`)
    .setDescription(
      `**${players.length} players available**\n` +
      `Sorted by Overall Rating (highest first)`
    )
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /fa-offer to make an offer` });
  
  // Add players
  let playersList = '';
  pageItems.forEach((player, idx) => {
    const num = start + idx + 1;
    const status = getStatusEmoji(player.status);
    playersList += `**${num}. ${player.name}** ${status}\n`;
    playersList += `   ${player.role} • OVR ${player.overall} • Age ${player.age} • ${player.experience}yr exp\n`;
    
    if (player.waived && player.previous_team) {
      playersList += `   ⚠️ Waived by ${player.previous_team}\n`;
    }
    
    playersList += '\n';
  });
  
  embed.addFields({
    name: '📋 Players',
    value: playersList || 'None'
  });
  
  return embed;
}

function generatePaginationButtons(page, totalPages) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`fa_market_first_${page}`)
        .setLabel('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`fa_market_prev_${page}`)
        .setLabel('◀️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`fa_market_page_${page}`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`fa_market_next_${page}`)
        .setLabel('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`fa_market_last_${page}`)
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1)
    );
}

function getStatusEmoji(status) {
  switch (status) {
    case 'available': return '🟢';
    case 'offered': return '🟡';
    case 'signed': return '✅';
    default: return '⚪';
  }
}