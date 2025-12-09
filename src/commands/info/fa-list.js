// ═══════════════════════════════════════════════════════
// FA LIST COMMAND - View Free Agent Market
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAvailablePlayers } = require('../../services/freeAgentService');

// Items per page
const ITEMS_PER_PAGE = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fa-list')
    .setDescription('View Free Agent Market')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('Season')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('role')
        .setDescription('Filter by role')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Point Guard (PG/PM)', value: 'pg' },
          { name: 'Shooting Guard (G)', value: 'g' },
          { name: 'Small Forward (AP)', value: 'ap' },
          { name: 'Power Forward (AG)', value: 'ag' },
          { name: 'Center (C)', value: 'c' }
        ))
    .addIntegerOption(option =>
      option.setName('min_overall')
        .setDescription('Minimum overall rating')
        .setRequired(false)
        .addChoices(
          { name: '75+', value: 75 },
          { name: '70-74', value: 70 },
          { name: '65-69', value: 65 },
          { name: 'All', value: 0 }
        ))
    .addStringOption(option =>
      option.setName('sort_by')
        .setDescription('Sort by')
        .setRequired(false)
        .addChoices(
          { name: 'Overall (highest first)', value: 'overall' },
          { name: 'Age (youngest first)', value: 'age' },
          { name: 'Name (A-Z)', value: 'name' }
        )),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const season = interaction.options.getString('season') || '2025';
    const roleFilter = interaction.options.getString('role') || 'all';
    const minOverall = interaction.options.getInteger('min_overall') || 0;
    const sortBy = interaction.options.getString('sort_by') || 'overall';
    
    try {
      // Build filters
      const filters = {
        sort_by: sortBy
      };
      
      if (roleFilter !== 'all') {
        filters.role = roleFilter;
      }
      
      if (minOverall > 0) {
        filters.min_overall = minOverall;
      }
      
      // Get players
      const players = await getAvailablePlayers(season, filters);
      
      if (players.length === 0) {
        return interaction.editReply({
          content: '❌ No free agents found with these filters.'
        });
      }
      
      // Pagination
      const page = 0;
      const totalPages = Math.ceil(players.length / ITEMS_PER_PAGE);
      
      // Generate embed
      const embed = generateMarketEmbed(players, page, totalPages, season, filters);
      
      // Generate buttons
      const row = generatePaginationButtons(page, totalPages);
      
      await interaction.editReply({
        embeds: [embed],
        components: totalPages > 1 ? [row] : []
      });
      
      // Store data for pagination
      if (totalPages > 1) {
        const collectorFilter = i => i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({
          filter: collectorFilter,
          time: 300000 // 5 minutes
        });
        
        collector.on('collect', async i => {
          if (i.customId.startsWith('fa_market_')) {
            const action = i.customId.split('_')[2];
            let newPage = page;
            
            if (action === 'prev') newPage = Math.max(0, getCurrentPage(i) - 1);
            if (action === 'next') newPage = Math.min(totalPages - 1, getCurrentPage(i) + 1);
            if (action === 'first') newPage = 0;
            if (action === 'last') newPage = totalPages - 1;
            
            const newEmbed = generateMarketEmbed(players, newPage, totalPages, season, filters);
            const newRow = generatePaginationButtons(newPage, totalPages);
            
            await i.update({
              embeds: [newEmbed],
              components: [newRow]
            });
          }
        });
      }
      
    } catch (error) {
      console.error('Error fetching FA market:', error);
      await interaction.editReply({
        content: `❌ Error fetching free agents: ${error.message}`
      });
    }
  }
};

function generateMarketEmbed(players, page, totalPages, season, filters) {
  const start = page * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = players.slice(start, end);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🏀 FREE AGENT MARKET ${season}`)
    .setDescription(
      `**${players.length} players available**\n` +
      (filters.role ? `Role: ${filters.role.toUpperCase()}\n` : '') +
      (filters.min_overall ? `Min Overall: ${filters.min_overall}+\n` : '') +
      `Sort: ${filters.sort_by}`
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

function getCurrentPage(interaction) {
  const parts = interaction.customId.split('_');
  return parseInt(parts[parts.length - 1]);
}

function getStatusEmoji(status) {
  switch (status) {
    case 'available': return '🟢';
    case 'offered': return '🟡';
    case 'signed': return '✅';
    default: return '⚪';
  }
}