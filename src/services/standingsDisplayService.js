// ═══════════════════════════════════════════════════════
// STANDINGS DISPLAY SERVICE - Generate and update embeds
// ═══════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');
const { getStandings } = require('./standingsService');

// ───────────────────────────────────────────────────────
// GENERATE STANDINGS EMBED
// ───────────────────────────────────────────────────────

function generateStandingsEmbed(teams, title, color = 0x1D428A) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setColor(color)
    .setTimestamp();
  
  if (teams.length === 0) {
    embed.setDescription('No teams found');
    return embed;
  }
  
  // Build table
  let description = '```\n';
  description += ' #  Team                W  L   PCT   GB  Home   Away  Conf  Strk L10\n';
  description += '──────────────────────────────────────────────────────────────────\n';
  
  teams.forEach((team, index) => {
    const rank = (index + 1).toString().padStart(2);
    const name = team.name.substring(0, 18).padEnd(18);
    const wins = team.wins.toString().padStart(2);
    const losses = team.losses.toString().padStart(2);
    const pct = team.pct.toFixed(3);
    const gb = team.gb === 0 ? ' - ' : team.gb.toFixed(1).padStart(3);
    const home = `${team.home_wins}-${team.home_losses}`.padEnd(5);
    const away = `${team.away_wins}-${team.away_losses}`.padEnd(5);
    const conf = `${team.conf_wins}-${team.conf_losses}`.padEnd(5);
    const streak = team.streak.padEnd(3);
    const l10 = `${team.last_10_wins}-${team.last_10_losses}`;
    
    description += `${rank}. ${name} ${wins} ${losses} ${pct} ${gb}  ${home} ${away} ${conf} ${streak} ${l10}\n`;
  });
  
  description += '```';
  
  embed.setDescription(description);
  embed.setFooter({ text: `Updated: ${new Date().toLocaleString('it-IT')}` });
  
  return embed;
}

// ───────────────────────────────────────────────────────
// PUBLISH ALL STANDINGS EMBEDS
// ───────────────────────────────────────────────────────

async function publishStandingsEmbeds(channel, season) {
  try {
    console.log(`📤 Publishing standings embeds in ${channel.name}...`);
    
    const db = admin.firestore();
    
    // Delete old messages (cleanup)
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      if (messages.size > 0) {
        await channel.bulkDelete(messages);
      }
    } catch (err) {
      console.warn('Could not bulk delete old messages:', err.message);
    }
    
    // Header
    const headerEmbed = new EmbedBuilder()
      .setTitle('📊 NBA FANTASY LEAGUE STANDINGS')
      .setDescription(`**Season ${season}**\n\nStandings update automatically after each game result.`)
      .setColor(0x1D428A)
      .setTimestamp();
    
    await channel.send({ embeds: [headerEmbed] });
    
    // Store message IDs
    const messageIds = {};
    
    // 1. OVERALL
    const overallTeams = await getStandings(season, 'overall');
    const overallEmbed = generateStandingsEmbed(overallTeams, 'OVERALL STANDINGS', 0xFFD700);
    const overallMsg = await channel.send({ embeds: [overallEmbed] });
    messageIds.overall = overallMsg.id;
    
    // 2. EASTERN CONFERENCE
    const easternTeams = await getStandings(season, 'eastern');
    const easternEmbed = generateStandingsEmbed(easternTeams, 'EASTERN CONFERENCE', 0xFF0000);
    const easternMsg = await channel.send({ embeds: [easternEmbed] });
    messageIds.eastern = easternMsg.id;
    
    // 3. WESTERN CONFERENCE
    const westernTeams = await getStandings(season, 'western');
    const westernEmbed = generateStandingsEmbed(westernTeams, 'WESTERN CONFERENCE', 0x0000FF);
    const westernMsg = await channel.send({ embeds: [westernEmbed] });
    messageIds.western = westernMsg.id;
    
    // 4. ATLANTIC DIVISION
    const atlanticTeams = await getStandings(season, 'atlantic');
    const atlanticEmbed = generateStandingsEmbed(atlanticTeams, 'ATLANTIC DIVISION', 0x00FF00);
    const atlanticMsg = await channel.send({ embeds: [atlanticEmbed] });
    messageIds.atlantic = atlanticMsg.id;
    
    // 5. CENTRAL DIVISION
    const centralTeams = await getStandings(season, 'central');
    const centralEmbed = generateStandingsEmbed(centralTeams, 'CENTRAL DIVISION', 0x00FFFF);
    const centralMsg = await channel.send({ embeds: [centralEmbed] });
    messageIds.central = centralMsg.id;
    
    // 6. SOUTHEAST DIVISION
    const southeastTeams = await getStandings(season, 'southeast');
    const southeastEmbed = generateStandingsEmbed(southeastTeams, 'SOUTHEAST DIVISION', 0xFF00FF);
    const southeastMsg = await channel.send({ embeds: [southeastEmbed] });
    messageIds.southeast = southeastMsg.id;
    
    // 7. NORTHWEST DIVISION
    const northwestTeams = await getStandings(season, 'northwest');
    const northwestEmbed = generateStandingsEmbed(northwestTeams, 'NORTHWEST DIVISION', 0xFFFF00);
    const northwestMsg = await channel.send({ embeds: [northwestEmbed] });
    messageIds.northwest = northwestMsg.id;
    
    // 8. PACIFIC DIVISION
    const pacificTeams = await getStandings(season, 'pacific');
    const pacificEmbed = generateStandingsEmbed(pacificTeams, 'PACIFIC DIVISION', 0xFF8800);
    const pacificMsg = await channel.send({ embeds: [pacificEmbed] });
    messageIds.pacific = pacificMsg.id;
    
    // 9. SOUTHWEST DIVISION
    const southwestTeams = await getStandings(season, 'southwest');
    const southwestEmbed = generateStandingsEmbed(southwestTeams, 'SOUTHWEST DIVISION', 0x8800FF);
    const southwestMsg = await channel.send({ embeds: [southwestEmbed] });
    messageIds.southwest = southwestMsg.id;
    
    // Save message IDs in database
    await db.collection('standings').doc(season).update({
      standings_messages: messageIds,
      standings_channel_id: channel.id
    });
    
    console.log('✅ Published all 9 standings embeds');
    
    return messageIds;
    
  } catch (error) {
    console.error('Error publishing standings:', error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// REFRESH ALL STANDINGS EMBEDS
// ───────────────────────────────────────────────────────

async function refreshStandingsEmbeds(season, guild) {
  try {
    console.log(`🔄 Refreshing standings embeds for ${season}...`);
    
    const db = admin.firestore();
    const standingsDoc = await db.collection('standings').doc(season).get();
    
    if (!standingsDoc.exists) {
      console.warn('Standings not found');
      return false;
    }
    
    const standings = standingsDoc.data();
    const messageIds = standings.standings_messages;
    const channelId = standings.standings_channel_id;
    
    if (!messageIds || !channelId) {
      console.warn('No message IDs or channel ID found');
      return false;
    }
    
    const channel = guild.channels.cache.get(channelId);
    
    if (!channel) {
      console.warn('Standings channel not found');
      return false;
    }
    
    // Update each embed
    const updates = [
      { type: 'overall', title: 'OVERALL STANDINGS', color: 0xFFD700 },
      { type: 'eastern', title: 'EASTERN CONFERENCE', color: 0xFF0000 },
      { type: 'western', title: 'WESTERN CONFERENCE', color: 0x0000FF },
      { type: 'atlantic', title: 'ATLANTIC DIVISION', color: 0x00FF00 },
      { type: 'central', title: 'CENTRAL DIVISION', color: 0x00FFFF },
      { type: 'southeast', title: 'SOUTHEAST DIVISION', color: 0xFF00FF },
      { type: 'northwest', title: 'NORTHWEST DIVISION', color: 0xFFFF00 },
      { type: 'pacific', title: 'PACIFIC DIVISION', color: 0xFF8800 },
      { type: 'southwest', title: 'SOUTHWEST DIVISION', color: 0x8800FF }
    ];
    
    for (const update of updates) {
      try {
        const messageId = messageIds[update.type];
        
        if (!messageId) continue;
        
        const message = await channel.messages.fetch(messageId);
        const teams = await getStandings(season, update.type);
        const embed = generateStandingsEmbed(teams, update.title, update.color);
        
        await message.edit({ embeds: [embed] });
        
        console.log(`  ✅ Updated ${update.type}`);
        
      } catch (error) {
        console.error(`  ❌ Failed to update ${update.type}:`, error.message);
      }
    }
    
    console.log('✅ All standings embeds refreshed');
    
    return true;
    
  } catch (error) {
    console.error('Error refreshing standings:', error);
    return false;
  }
}

// ───────────────────────────────────────────────────────
// EXPORTS
// ───────────────────────────────────────────────────────

module.exports = {
  generateStandingsEmbed,
  publishStandingsEmbeds,
  refreshStandingsEmbeds
};