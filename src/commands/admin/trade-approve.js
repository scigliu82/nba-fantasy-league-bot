const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { approveTrade, getTrade } = require('../../services/tradeService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade-approve')
    .setDescription('Approve a trade (Admin only)')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Trade ID (e.g., trade_1)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const tradeId = interaction.options.getString('id');
    const commissionerId = interaction.user.id;
    const client = interaction.client;
    
    try {
      // Fetch trade per verificare che esista
      const trade = await getTrade(tradeId);
      
      if (!trade) {
        return interaction.editReply(`❌ Trade \`${tradeId}\` not found.`);
      }
      
      // Verifica status
      if (trade.status !== 'pending_approval') {
        return interaction.editReply(
          `❌ Cannot approve trade in status: **${trade.status}**\n\n` +
          `Only trades with status \`pending_approval\` can be approved.\n` +
          `Current status: \`${trade.status}\``
        );
      }
      
      // Mostra summary del trade
      const team1 = trade.teams[0];
      const team2 = trade.teams[1];
      
      await interaction.editReply(
        `⚙️ **Approving Trade #${trade.number}...**\n\n` +
        `**${getTeamName(team1)} ⇄ ${getTeamName(team2)}**\n\n` +
        `Please wait while the trade is being executed...`
      );
      
      // Approva trade
      const result = await approveTrade(tradeId, commissionerId, client);
      
      if (!result.success) {
        return interaction.editReply(
          `❌ **Failed to approve trade**\n\n` +
          `**Error:** ${result.error}\n\n` +
          `The trade has not been executed. Please check the error and try again.`
        );
      }
      
      // Success!
      const team1Sends = trade[`${team1}_sends`];
      const team2Sends = trade[`${team2}_sends`];
      
      let successMessage = `✅ **TRADE APPROVED & EXECUTED!**\n\n`;
      successMessage += `**Trade #${trade.number}:** ${getTeamName(team1)} ⇄ ${getTeamName(team2)}\n\n`;
      
      successMessage += `**${getTeamName(team1)} receives:**\n`;
      successMessage += formatPlayerList(team2Sends.players);
      successMessage += `\n`;
      
      successMessage += `**${getTeamName(team2)} receives:**\n`;
      successMessage += formatPlayerList(team1Sends.players);
      successMessage += `\n`;
      
      successMessage += `✅ Players transferred\n`;
      successMessage += `✅ Rosters updated automatically\n`;
      successMessage += `✅ Trade logged in database\n\n`;
      
      successMessage += `**Next steps:**\n`;
      successMessage += `• GMs will be notified (when notification system is ready)\n`;
      successMessage += `• Check team HQ channels to verify roster updates\n`;
      successMessage += `• Announce trade in #league-announcements if desired`;
      
      await interaction.editReply(successMessage);
      
      // Log in console
      console.log(`✅ Trade #${trade.number} approved by ${interaction.user.tag}`);
      console.log(`   ${getTeamName(team1)} ⇄ ${getTeamName(team2)}`);
      
      // TODO: Invia notifiche ai GM (Phase 2C)
      // TODO: Post in #league-announcements (Phase 2C)
      
    } catch (error) {
      console.error('Error approving trade:', error);
      await interaction.editReply(
        `❌ **An error occurred while approving the trade.**\n\n` +
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

function formatPlayerList(players) {
  if (!players || players.length === 0) {
    return '• None\n';
  }
  
  return players.map(p => {
    return `• ${p.name} (${p.overall || '?'} OVR, $${(p.salary / 1000000).toFixed(1)}M)`;
  }).join('\n');
}