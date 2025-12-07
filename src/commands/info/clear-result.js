// ═══════════════════════════════════════════════════════
// CLEAR RESULT COMMAND - Clear single game result
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');
const { recalculateStandings } = require('../../services/standingsService');
const { publishStandingsEmbeds } = require('../../services/standingsDisplayService');

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear_result')
    .setDescription('Clear a single game result')
    .addIntegerOption(option =>
      option
        .setName('round')
        .setDescription('Round number')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option
        .setName('home_team')
        .setDescription('Home team')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('away_team')
        .setDescription('Away team')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('season')
        .setDescription('Season (default: current)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'home_team' || focusedOption.name === 'away_team') {
      const teams = [
        { name: 'Atlanta Hawks', value: 'hawks' },
        { name: 'Boston Celtics', value: 'celtics' },
        { name: 'Brooklyn Nets', value: 'nets' },
        { name: 'Charlotte Hornets', value: 'hornets' },
        { name: 'Chicago Bulls', value: 'bulls' },
        { name: 'Cleveland Cavaliers', value: 'cavaliers' },
        { name: 'Dallas Mavericks', value: 'mavericks' },
        { name: 'Denver Nuggets', value: 'nuggets' },
        { name: 'Detroit Pistons', value: 'pistons' },
        { name: 'Golden State Warriors', value: 'warriors' },
        { name: 'Houston Rockets', value: 'rockets' },
        { name: 'Indiana Pacers', value: 'pacers' },
        { name: 'LA Clippers', value: 'clippers' },
        { name: 'Los Angeles Lakers', value: 'lakers' },
        { name: 'Memphis Grizzlies', value: 'grizzlies' },
        { name: 'Miami Heat', value: 'heat' },
        { name: 'Milwaukee Bucks', value: 'bucks' },
        { name: 'Minnesota Timberwolves', value: 'timberwolves' },
        { name: 'New Orleans Pelicans', value: 'pelicans' },
        { name: 'New York Knicks', value: 'knicks' },
        { name: 'Oklahoma City Thunder', value: 'thunder' },
        { name: 'Orlando Magic', value: 'magic' },
        { name: 'Philadelphia 76ers', value: 'sixers' },
        { name: 'Phoenix Suns', value: 'suns' },
        { name: 'Portland Trail Blazers', value: 'blazers' },
        { name: 'Sacramento Kings', value: 'kings' },
        { name: 'San Antonio Spurs', value: 'spurs' },
        { name: 'Toronto Raptors', value: 'raptors' },
        { name: 'Utah Jazz', value: 'jazz' },
        { name: 'Washington Wizards', value: 'wizards' }
      ];

      const filtered = teams.filter(team =>
        team.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      ).slice(0, 25);

      await interaction.respond(filtered);
    }
  },

  async execute(interaction) {
    await clearResult(interaction);
  },
};

// ───────────────────────────────────────────────────────
// CLEAR RESULT FUNCTION
// ───────────────────────────────────────────────────────

async function clearResult(interaction) {
  await interaction.deferReply();

  const round = interaction.options.getInteger('round');
  const homeTeam = interaction.options.getString('home_team');
  const awayTeam = interaction.options.getString('away_team');
  const season = interaction.options.getString('season') || process.env.CURRENT_SEASON || '2025-26';

  // Check permissions
  const hasCommissionerRole = interaction.member.roles.cache.some(r => r.name === 'Commissioner');
  
  if (!hasCommissionerRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({
      content: '❌ Only Commissioner can clear results!',
      ephemeral: true
    });
    return;
  }

  try {
    const db = admin.firestore();

    // ─────────────────────────────────────────────────────
    // STEP 1: Fetch schedule
    // ─────────────────────────────────────────────────────

    const scheduleRef = db.collection('schedules').doc(season);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      await interaction.editReply(`❌ Schedule not found for season ${season}`);
      return;
    }

    const schedule = scheduleDoc.data();
    const games = schedule.games;

    // ─────────────────────────────────────────────────────
    // STEP 2: Find the game
    // ─────────────────────────────────────────────────────

    const gameIndex = games.findIndex(g =>
      g.round === round &&
      g.home_team === homeTeam &&
      g.away_team === awayTeam
    );

    if (gameIndex === -1) {
      await interaction.editReply(
        `❌ **Game not found!**\n\n` +
        `**Round:** ${round}\n` +
        `**Matchup:** ${formatTeamName(homeTeam)} vs ${formatTeamName(awayTeam)}`
      );
      return;
    }

    const game = games[gameIndex];

    // Check if game was played
    if (!game.played) {
      await interaction.editReply(
        `⚠️ **Game not played yet!**\n\n` +
        `**Round:** ${round}\n` +
        `**Matchup:** ${formatTeamName(homeTeam)} vs ${formatTeamName(awayTeam)}\n\n` +
        `This game has no result to clear.`
      );
      return;
    }

    const previousScore = `${game.home_score}-${game.away_score}`;

    // ─────────────────────────────────────────────────────
    // STEP 3: Clear the result
    // ─────────────────────────────────────────────────────

    games[gameIndex] = {
      ...game,
      home_score: null,
      away_score: null,
      played: false,
      played_at: null
    };

    await scheduleRef.update({
      games: games,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // ─────────────────────────────────────────────────────
    // STEP 4: Recalculate standings and re-publish embeds
    // ─────────────────────────────────────────────────────

    await recalculateStandings(season);
    
    // Re-publish standings embeds (delete and recreate)
    const standingsChannel = interaction.guild.channels.cache.find(ch =>
      ch.name === '📊-standings' || ch.name.includes('standings')
    );

    if (standingsChannel) {
      // Delete old messages
      try {
        const messages = await standingsChannel.messages.fetch({ limit: 100 });
        if (messages.size > 0) {
          await standingsChannel.bulkDelete(messages);
        }
      } catch (err) {
        console.warn('Could not delete old standings messages:', err.message);
      }

      // Re-publish standings
      await publishStandingsEmbeds(standingsChannel, season);
      console.log('✅ Standings embeds re-published');
    } else {
      console.warn('⚠️  #standings channel not found');
    }

    // ─────────────────────────────────────────────────────
    // STEP 5: Update calendar embed
    // ─────────────────────────────────────────────────────

    try {
      const calendarMessages = schedule.calendar_messages;
      const calendarChannelId = schedule.calendar_channel_id;

      if (calendarMessages && calendarMessages[round] && calendarChannelId) {
        const calendarioChannel = interaction.guild.channels.cache.get(calendarChannelId);
        
        if (calendarioChannel) {
          const roundMessage = await calendarioChannel.messages.fetch(calendarMessages[round]);
          
          if (roundMessage) {
            const roundGames = games.filter(g => g.round === round);
            
            let roundText = `**🏀 TURNO ${round}**\n\n`;
            roundGames.forEach(g => {
              const home = formatTeamName(g.home_team);
              const away = formatTeamName(g.away_team);
              const status = g.played ? `✅ ${g.home_score}-${g.away_score}` : '⏳ Da giocare';
              roundText += `• ${home} vs ${away} - ${status}\n`;
            });

            const updatedEmbed = new EmbedBuilder()
              .setDescription(roundText)
              .setColor(0x0099FF);

            await roundMessage.edit({ embeds: [updatedEmbed] });
          }
        }
      }
    } catch (error) {
      console.error('Failed to update calendar embed:', error.message);
    }

    // ─────────────────────────────────────────────────────
    // DONE!
    // ─────────────────────────────────────────────────────

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ RESULT CLEARED')
      .setColor(0xFFA500)
      .setDescription(`**Round ${round}**\n\n${formatTeamName(homeTeam)} vs ${formatTeamName(awayTeam)}`)
      .addFields(
        { name: 'Previous Result', value: previousScore, inline: true },
        { name: 'New Status', value: '⏳ To be played', inline: true }
      )
      .setFooter({ text: `Cleared by ${interaction.user.tag} | Standings recalculated` })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    console.error('Error clearing result:', error);
    await interaction.editReply(`❌ **Error!**\n\n\`${error.message}\``);
  }
}

// ───────────────────────────────────────────────────────
// HELPER: FORMAT TEAM NAME
// ───────────────────────────────────────────────────────

function formatTeamName(teamId) {
  const teamNames = {
    hawks: 'Atlanta Hawks', celtics: 'Boston Celtics', nets: 'Brooklyn Nets',
    hornets: 'Charlotte Hornets', bulls: 'Chicago Bulls', cavaliers: 'Cleveland Cavaliers',
    mavericks: 'Dallas Mavericks', nuggets: 'Denver Nuggets', pistons: 'Detroit Pistons',
    warriors: 'Golden State Warriors', rockets: 'Houston Rockets', pacers: 'Indiana Pacers',
    clippers: 'LA Clippers', lakers: 'Los Angeles Lakers', grizzlies: 'Memphis Grizzlies',
    heat: 'Miami Heat', bucks: 'Milwaukee Bucks', timberwolves: 'Minnesota Timberwolves',
    pelicans: 'New Orleans Pelicans', knicks: 'New York Knicks', thunder: 'Oklahoma City Thunder',
    magic: 'Orlando Magic', sixers: 'Philadelphia 76ers', suns: 'Phoenix Suns',
    blazers: 'Portland Trail Blazers', kings: 'Sacramento Kings', spurs: 'San Antonio Spurs',
    raptors: 'Toronto Raptors', jazz: 'Utah Jazz', wizards: 'Washington Wizards'
  };
  return teamNames[teamId] || teamId;
}