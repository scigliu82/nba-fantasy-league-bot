const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');

// Team colors
const TEAM_COLORS = {
  hawks: 0xE03A3E,
  celtics: 0x007A33,
  nets: 0x000000,
  hornets: 0x1D1160,
  bulls: 0xCE1141,
  cavaliers: 0x860038,
  mavericks: 0x00538C,
  nuggets: 0x0E2240,
  pistons: 0xC8102E,
  warriors: 0x1D428A,
  rockets: 0xCE1141,
  pacers: 0x002D62,
  clippers: 0xC8102E,
  lakers: 0x552583,
  grizzlies: 0x5D76A9,
  heat: 0x98002E,
  bucks: 0x00471B,
  timberwolves: 0x0C2340,
  pelicans: 0x0C2340,
  knicks: 0xF58426,
  thunder: 0x007AC1,
  magic: 0x0077C0,
  sixers: 0x006BB6,
  suns: 0x1D1160,
  blazers: 0xE03A3E,
  kings: 0x5A2D81,
  spurs: 0xC4CED4,
  raptors: 0xCE1141,
  jazz: 0x002B5C,
  wizards: 0x002B5C
};

// Team emoji
const TEAM_EMOJI = {
  hawks: '🔴',
  celtics: '🟢',
  nets: '⚫',
  hornets: '💙',
  bulls: '🔴',
  cavaliers: '🟤',
  mavericks: '💙',
  nuggets: '💛',
  pistons: '🔴',
  warriors: '💛',
  rockets: '🔴',
  pacers: '💛',
  clippers: '🔴',
  lakers: '💜',
  grizzlies: '💙',
  heat: '🔥',
  bucks: '🟢',
  timberwolves: '💚',
  pelicans: '💙',
  knicks: '🧡',
  thunder: '⚡',
  magic: '💙',
  sixers: '🔴',
  suns: '🟣',
  blazers: '🔴',
  kings: '💜',
  spurs: '⚫',
  raptors: '🔴',
  jazz: '💛',
  wizards: '🔵'
};

/**
 * Genera il Control Panel completo per un team
 * @param {string} teamId - ID del team (es. "lakers")
 * @returns {Object} - Oggetto con embeds e components per Discord
 */
async function generateControlPanel(teamId) {
  const db = admin.firestore();
  
  // Fetch team data
  const teamDoc = await db.collection('teams').doc(teamId).get();
  
  if (!teamDoc.exists) {
    throw new Error(`Team ${teamId} not found in database`);
  }
  
  const team = teamDoc.data();
  
  // Create embed
  const embed = new EmbedBuilder()
    .setColor(TEAM_COLORS[teamId] || 0x000000)
    .setTitle(`${TEAM_EMOJI[teamId]} ${team.name.toUpperCase()} - CONTROL PANEL`)
    .setDescription(
      '**Use the buttons below to manage your team**\n\n' +
      '✅ = Available now\n' +
      '🚧 = Coming soon'
    )
    .setFooter({ 
      text: `⚙️ Control Panel v1.0 | ${new Date().toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      })}` 
    });
  
  // Row 1: Team Info (✅ FUNZIONANTI)
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`cp_view_roster_${teamId}`)
        .setLabel('View Full Roster')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId(`cp_cap_details_${teamId}`)
        .setLabel('Cap Details')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💰'),
      new ButtonBuilder()
        .setCustomId(`cp_contract_list_${teamId}`)
        .setLabel('Contract List')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋')
    );
  
  // Row 2: Trade Operations (🚧 COMING SOON)
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`cp_propose_trade_${teamId}`)
        .setLabel('Propose Trade')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_view_trades_${teamId}`)
        .setLabel('View Trade Offers')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📨')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_trade_history_${teamId}`)
        .setLabel('Trade History')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜')
        .setDisabled(true)
    );
  
  // Row 3: Free Agency (🚧 COMING SOON)
  const row3 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`cp_make_fa_offer_${teamId}`)
        .setLabel('Make FA Offer')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✍️')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_view_fa_offers_${teamId}`)
        .setLabel('View My Offers')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_fa_market_${teamId}`)
        .setLabel('FA Market')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏪')
        .setDisabled(true)
    );
  
  // Row 4: Contract Management (🚧 COMING SOON)
  const row4 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`cp_extend_player_${teamId}`)
        .setLabel('Extend Player')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_exercise_option_${teamId}`)
        .setLabel('Exercise Option')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✅')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_decline_option_${teamId}`)
        .setLabel('Decline Option')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
        .setDisabled(true)
    );
  
  // Row 5: League Info (MISTO)
  const row5 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`cp_standings_${teamId}`)
        .setLabel('Standings')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📈')
        .setDisabled(true), // Per ora disabilitato, attiveremo dopo
      new ButtonBuilder()
        .setCustomId(`cp_schedule_${teamId}`)
        .setLabel('Schedule')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📅')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`cp_league_news_${teamId}`)
        .setLabel('League News')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📰')
        .setDisabled(true)
    );
  
  return {
    embeds: [embed],
    components: [row1, row2, row3, row4, row5]
  };
}

module.exports = { generateControlPanel };