const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPendingTrades } = require('../../services/tradeService');
const { formatValidationForDiscord } = require('../../services/tradeValidationService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade-pending')
    .setDescription('View all trades pending commissioner approval (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Fetch pending trades
      const pendingTrades = await getPendingTrades();
      
      if (pendingTrades.length === 0) {
        return interaction.editReply('✅ No trades pending approval.');
      }
      
      // Crea embed per ogni trade
      let response = `📋 **TRADES PENDING COMMISSIONER APPROVAL**\n\n`;
      response += `Found ${pendingTrades.length} trade(s) waiting for your decision.\n\n`;
      
      for (const trade of pendingTrades) {
        response += formatTradeForList(trade);
        response += '\n───────────────────────────────────\n\n';
      }
      
      // Istruzioni
      response += '**Commands:**\n';
      response += '• `/trade-approve id:[trade_id]` - Approve a trade\n';
      response += '• `/trade-veto id:[trade_id]` - Veto a trade\n\n';
      response += '💡 Click the buttons below each trade for quick actions.';
      
      await interaction.editReply({ content: response });
      
      // Invia trade details con bottoni (max 10 per non superare limiti Discord)
      const tradesToShow = pendingTrades.slice(0, 10);
      
      for (const trade of tradesToShow) {
        await sendTradeDetails(interaction, trade);
      }
      
      if (pendingTrades.length > 10) {
        await interaction.followUp({
          content: `⚠️ Showing first 10 trades. ${pendingTrades.length - 10} more pending. Use \`/trade-approve\` or \`/trade-veto\` with trade ID.`,
          ephemeral: true
        });
      }
      
    } catch (error) {
      console.error('Error fetching pending trades:', error);
      await interaction.editReply('❌ Error fetching pending trades. Check console for details.');
    }
  }
};

/**
 * Formatta trade per lista
 */
function formatTradeForList(trade) {
  const team1 = trade.teams[0];
  const team2 = trade.teams[1];
  
  const team1Sends = trade[`${team1}_sends`];
  const team2Sends = trade[`${team2}_sends`];
  
  let text = `**Trade #${trade.number}** (ID: \`${trade.id}\`)\n`;
  text += `${getTeamName(team1)} ⇄ ${getTeamName(team2)}\n`;
  text += `Proposed: ${formatDate(trade.proposed_at)}\n`;
  
  // Players summary
  const team1PlayerNames = team1Sends.players.map(p => p.name).join(', ');
  const team2PlayerNames = team2Sends.players.map(p => p.name).join(', ');
  
  text += `\n${getTeamName(team1)} → ${team1PlayerNames || 'None'}`;
  text += `\n${getTeamName(team2)} → ${team2PlayerNames || 'None'}`;
  
  // Validation status
  if (trade.validation?.valid) {
    text += '\n✅ Validation: PASSED';
  } else {
    text += '\n❌ Validation: FAILED';
  }
  
  // Red flags
  if (trade.validation?.redFlags && trade.validation.redFlags.length > 0) {
    text += `\n⚠️ Red Flags: ${trade.validation.redFlags.length}`;
  }
  
  return text;
}

/**
 * Invia dettagli completi del trade con bottoni
 */
async function sendTradeDetails(interaction, trade) {
  const team1 = trade.teams[0];
  const team2 = trade.teams[1];
  
  const team1Sends = trade[`${team1}_sends`];
  const team1Receives = trade[`${team1}_receives`];
  const team2Sends = trade[`${team2}_sends`];
  const team2Receives = trade[`${team2}_receives`];
  
  // Crea embed dettagliato
  const embed = new EmbedBuilder()
    .setTitle(`🔄 Trade #${trade.number}`)
    .setDescription(`**${getTeamName(team1)} ⇄ ${getTeamName(team2)}**`)
    .setColor(trade.validation?.valid ? 0x00FF00 : 0xFF0000)
    .addFields(
      {
        name: `${getTeamName(team1)} Sends`,
        value: formatPlayers(team1Sends.players) + `\nTotal: $${(team1Sends.total_salary / 1000000).toFixed(1)}M`,
        inline: true
      },
      {
        name: `${getTeamName(team1)} Receives`,
        value: formatPlayers(team1Receives.players) + `\nTotal: $${(team1Receives.total_salary / 1000000).toFixed(1)}M`,
        inline: true
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: false
      },
      {
        name: 'Validation Status',
        value: trade.validation?.valid ? '✅ All checks passed' : '❌ Validation failed',
        inline: true
      },
      {
        name: 'Proposed By',
        value: `<@${trade.proposed_by}>`,
        inline: true
      },
      {
        name: 'Date',
        value: formatDate(trade.proposed_at),
        inline: true
      }
    )
    .setFooter({ text: `Trade ID: ${trade.id}` })
    .setTimestamp();
  
  // Red flags
  if (trade.validation?.redFlags && trade.validation.redFlags.length > 0) {
    let flagsText = '';
    trade.validation.redFlags.forEach(flag => {
      const emoji = flag.severity === 'high' ? '🔴' : flag.severity === 'medium' ? '🟡' : '🟢';
      flagsText += `${emoji} ${flag.message}\n`;
    });
    embed.addFields({
      name: '🚩 Red Flags',
      value: flagsText,
      inline: false
    });
  }
  
  // Validation details
  if (trade.validation?.checks && trade.validation.checks.length > 0) {
    let checksText = '';
    trade.validation.checks.forEach(check => {
      const emoji = check.passed ? '✅' : '❌';
      checksText += `${emoji} ${check.category}: ${check.message}\n`;
    });
    embed.addFields({
      name: 'Validation Details',
      value: checksText.substring(0, 1024), // Discord limit
      inline: false
    });
  }
  
  // Bottoni azione
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`trade_approve_${trade.id}`)
        .setLabel('Approve Trade')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`trade_veto_${trade.id}`)
        .setLabel('Veto Trade')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⛔')
    );
  
  await interaction.followUp({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

/**
 * Helper functions
 */
function getTeamName(teamId) {
  const teamNames = {
    lakers: 'Lakers',
    celtics: 'Celtics',
    warriors: 'Warriors',
    nets: 'Nets',
    heat: 'Heat',
    bucks: 'Bucks',
    sixers: '76ers',
    nuggets: 'Nuggets',
    suns: 'Suns',
    mavericks: 'Mavericks',
    grizzlies: 'Grizzlies',
    hawks: 'Hawks',
    cavaliers: 'Cavaliers',
    knicks: 'Knicks',
    pelicans: 'Pelicans',
    timberwolves: 'Timberwolves',
    clippers: 'Clippers',
    kings: 'Kings',
    blazers: 'Trail Blazers',
    thunder: 'Thunder',
    jazz: 'Jazz',
    spurs: 'Spurs',
    bulls: 'Bulls',
    pacers: 'Pacers',
    hornets: 'Hornets',
    pistons: 'Pistons',
    rockets: 'Rockets',
    magic: 'Magic',
    raptors: 'Raptors',
    wizards: 'Wizards'
  };
  return teamNames[teamId] || teamId;
}

function formatPlayers(players) {
  if (!players || players.length === 0) {
    return 'None';
  }
  
  return players.map(p => {
    return `• ${p.name} (${p.overall || '?'} OVR) - $${(p.salary / 1000000).toFixed(1)}M`;
  }).join('\n');
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}