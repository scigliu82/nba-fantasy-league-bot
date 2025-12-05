const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { vetoTrade, getTrade } = require('../../services/tradeService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade-veto')
    .setDescription('Veto a trade with reason (Admin only)')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Trade ID (e.g., trade_1)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for veto (required)')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const tradeId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason');
    const commissionerId = interaction.user.id;
    
    try {
      // Fetch trade per verificare che esista
      const trade = await getTrade(tradeId);
      
      if (!trade) {
        return interaction.editReply(`❌ Trade \`${tradeId}\` not found.`);
      }
      
      // Verifica status
      if (trade.status !== 'pending_approval') {
        return interaction.editReply(
          `❌ Cannot veto trade in status: **${trade.status}**\n\n` +
          `Only trades with status \`pending_approval\` can be vetoed.\n` +
          `Current status: \`${trade.status}\``
        );
      }
      
      // Mostra summary del trade
      const team1 = trade.teams[0];
      const team2 = trade.teams[1];
      
      await interaction.editReply(
        `⛔ **Vetoing Trade #${trade.number}...**\n\n` +
        `**${getTeamName(team1)} ⇄ ${getTeamName(team2)}**\n\n` +
        `**Reason:** ${reason}\n\n` +
        `Please wait...`
      );
      
      // Veta trade
      const result = await vetoTrade(tradeId, commissionerId, reason);
      
      if (!result.success) {
        return interaction.editReply(
          `❌ **Failed to veto trade**\n\n` +
          `**Error:** ${result.error}\n\n` +
          `Please check the error and try again.`
        );
      }
      
      // Success!
      const team1Sends = trade[`${team1}_sends`];
      const team2Sends = trade[`${team2}_sends`];
      
      let successMessage = `⛔ **TRADE VETOED**\n\n`;
      successMessage += `**Trade #${trade.number}:** ${getTeamName(team1)} ⇄ ${getTeamName(team2)}\n\n`;
      
      successMessage += `**Trade Details:**\n`;
      successMessage += `• ${getTeamName(team1)} sends: ${formatPlayerNames(team1Sends.players)}\n`;
      successMessage += `• ${getTeamName(team2)} sends: ${formatPlayerNames(team2Sends.players)}\n\n`;
      
      successMessage += `**Veto Reason:**\n`;
      successMessage += `> ${reason}\n\n`;
      
      successMessage += `**Status:**\n`;
      successMessage += `✅ Trade marked as vetoed\n`;
      successMessage += `✅ No roster changes made\n`;
      successMessage += `✅ Trade logged in database\n\n`;
      
      successMessage += `**Next steps:**\n`;
      successMessage += `• GMs will be notified (when notification system is ready)\n`;
      successMessage += `• GMs can propose a revised trade if desired\n`;
      successMessage += `• Consider explaining your decision to the GMs`;
      
      await interaction.editReply(successMessage);
      
      // Log in console
      console.log(`⛔ Trade #${trade.number} vetoed by ${interaction.user.tag}`);
      console.log(`   ${getTeamName(team1)} ⇄ ${getTeamName(team2)}`);
      console.log(`   Reason: ${reason}`);
      
      // TODO: Invia notifiche ai GM (Phase 2C)
      
    } catch (error) {
      console.error('Error vetoing trade:', error);
      await interaction.editReply(
        `❌ **An error occurred while vetoing the trade.**\n\n` +
        `**Error:** ${error.message}\n\n` +
        `Please check the console for more details.`
      );
    }
  }
};

/**
 * Helper functions
 */
function getTeamName(teamId) {
  const teamNames = {
    lakers: 'Los Angeles Lakers',
    celtics: 'Boston Celtics',
    warriors: 'Golden State Warriors',
    nets: 'Brooklyn Nets',
    heat: 'Miami Heat',
    bucks: 'Milwaukee Bucks',
    sixers: 'Philadelphia 76ers',
    nuggets: 'Denver Nuggets',
    suns: 'Phoenix Suns',
    mavericks: 'Dallas Mavericks',
    grizzlies: 'Memphis Grizzlies',
    hawks: 'Atlanta Hawks',
    cavaliers: 'Cleveland Cavaliers',
    knicks: 'New York Knicks',
    pelicans: 'New Orleans Pelicans',
    timberwolves: 'Minnesota Timberwolves',
    clippers: 'Los Angeles Clippers',
    kings: 'Sacramento Kings',
    blazers: 'Portland Trail Blazers',
    thunder: 'Oklahoma City Thunder',
    jazz: 'Utah Jazz',
    spurs: 'San Antonio Spurs',
    bulls: 'Chicago Bulls',
    pacers: 'Indiana Pacers',
    hornets: 'Charlotte Hornets',
    pistons: 'Detroit Pistons',
    rockets: 'Houston Rockets',
    magic: 'Orlando Magic',
    raptors: 'Toronto Raptors',
    wizards: 'Washington Wizards'
  };
  return teamNames[teamId] || teamId;
}

function formatPlayerNames(players) {
  if (!players || players.length === 0) {
    return 'None';
  }
  
  return players.map(p => p.name).join(', ');
}