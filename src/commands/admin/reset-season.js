// ═══════════════════════════════════════════════════════
// RESET SEASON COMMAND - Reset season with backup
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');
const { createBackup } = require('../../services/backupService');
const { initializeStandings } = require('../../services/standingsService');
const { publishStandingsEmbeds } = require('../../services/standingsDisplayService');

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset_season')
        .setDescription('⚠️ Reset season (creates backup first)')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Type of reset')
            .setRequired(true)
            .addChoices(
              { name: 'Full Reset (calendar + standings + announcements)', value: 'full' },
              { name: 'Results Only (reset results, keep structure)', value: 'results_only' },
              { name: 'Standings Only (recalculate from results)', value: 'standings_only' }
            )
        )
        .addStringOption(option =>
          option
            .setName('confirm')
            .setDescription('Type CONFIRM to proceed (required)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('season')
            .setDescription('Season to reset (default: current)')
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'reset_season') {
      await resetSeason(interaction);
    }
  },
};

// ───────────────────────────────────────────────────────
// RESET SEASON FUNCTION
// ───────────────────────────────────────────────────────

async function resetSeason(interaction) {
  await interaction.deferReply();

  const type = interaction.options.getString('type');
  const confirm = interaction.options.getString('confirm');
  const season = interaction.options.getString('season') || process.env.CURRENT_SEASON || '2025-26';
  const userId = interaction.user.id;

  // ─────────────────────────────────────────────────────
  // STEP 1: Verify confirmation
  // ─────────────────────────────────────────────────────

  if (confirm !== 'CONFIRM') {
    await interaction.editReply({
      content: `❌ **Reset cancelled!**\n\nYou must type exactly \`CONFIRM\` to proceed.\nYou typed: \`${confirm}\``,
      ephemeral: true
    });
    return;
  }

  // ─────────────────────────────────────────────────────
  // STEP 2: Check permissions
  // ─────────────────────────────────────────────────────

  const hasCommissionerRole = interaction.member.roles.cache.some(r => r.name === 'Commissioner');
  
  if (!hasCommissionerRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({
      content: '❌ Only Commissioner can reset the season!',
      ephemeral: true
    });
    return;
  }

  try {
    const db = admin.firestore();

    // ─────────────────────────────────────────────────────
    // STEP 3: Fetch current data
    // ─────────────────────────────────────────────────────

    const scheduleRef = db.collection('schedules').doc(season);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      await interaction.editReply(`❌ Schedule not found for season ${season}`);
      return;
    }

    const schedule = scheduleDoc.data();
    const totalGames = schedule.games.length;
    const playedGames = schedule.games.filter(g => g.played).length;

    // ─────────────────────────────────────────────────────
    // STEP 4: Show warning
    // ─────────────────────────────────────────────────────

    let progressMsg = `🚨 **SEASON RESET IN PROGRESS**\n\n`;
    progressMsg += `**Type:** ${type}\n`;
    progressMsg += `**Season:** ${season}\n`;
    progressMsg += `**Games affected:** ${totalGames}\n`;
    progressMsg += `**Played games:** ${playedGames}\n\n`;
    progressMsg += `**Step 1/5:** Creating backup... ⏳`;

    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 5: Create backup
    // ─────────────────────────────────────────────────────

    const backupResult = await createBackup(season, `pre_reset_${type}`, userId);
    const backupId = backupResult.backupId;

    progressMsg = progressMsg.replace('Creating backup... ⏳', `Creating backup... ✅\n📦 Backup ID: \`${backupId}\``);
    progressMsg += `\n**Step 2/5:** Resetting data... ⏳`;
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 6: Reset based on type
    // ─────────────────────────────────────────────────────

    let gamesReset = 0;
    let standingsReset = false;
    let announcementsCleared = 0;

    if (type === 'full' || type === 'results_only') {
      // Reset all game results
      schedule.games = schedule.games.map(game => ({
        ...game,
        home_score: null,
        away_score: null,
        played: false,
        played_at: null
      }));

      await scheduleRef.update({
        games: schedule.games,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      gamesReset = totalGames;

      // Reset standings
      await initializeStandings(season);
      standingsReset = true;
    }

    if (type === 'standings_only') {
      // Recalculate standings from results
      const { recalculateStandings } = require('../../services/standingsService');
      await recalculateStandings(season);
      standingsReset = true;
    }

    progressMsg = progressMsg.replace('Resetting data... ⏳', 'Resetting data... ✅');
    progressMsg += `\n**Step 3/5:** Updating calendar embeds... ⏳`;
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 7: Re-publish calendar embeds (delete and recreate)
    // ─────────────────────────────────────────────────────

    if (type === 'full' || type === 'results_only') {
      const calendarioChannel = interaction.guild.channels.cache.find(ch =>
        ch.name === '📅-calendario' || ch.name.includes('calendario')
      );

      if (calendarioChannel) {
        // Delete old messages
        try {
          const messages = await calendarioChannel.messages.fetch({ limit: 100 });
          if (messages.size > 0) {
            await calendarioChannel.bulkDelete(messages);
          }
        } catch (err) {
          console.warn('Could not delete old calendar messages:', err.message);
        }

        // Re-publish schedule
        await publishScheduleFromReset(calendarioChannel, schedule, season);
        console.log('✅ Calendar embeds re-published');
      }
    }

    progressMsg = progressMsg.replace('Updating calendar embeds... ⏳', 'Updating calendar embeds... ✅');
    progressMsg += `\n**Step 4/5:** Updating standings embeds... ⏳`;
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 8: Re-publish standings embeds (delete and recreate)
    // ─────────────────────────────────────────────────────

    if (standingsReset) {
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
      }
    }

    progressMsg = progressMsg.replace('Updating standings embeds... ⏳', 'Updating standings embeds... ✅');
    progressMsg += `\n**Step 5/5:** Clearing announcements... ⏳`;
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 9: Clear announcements (optional)
    // ─────────────────────────────────────────────────────

    if (type === 'full') {
      announcementsCleared = await clearAnnouncementsChannel(interaction.guild);
    }

    progressMsg = progressMsg.replace('Clearing announcements... ⏳', 'Clearing announcements... ✅');
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // DONE!
    // ─────────────────────────────────────────────────────

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ SEASON RESET COMPLETE')
      .setColor(0x00FF00)
      .addFields(
        { name: '📦 Backup Created', value: `\`${backupId}\``, inline: false },
        { name: '🎯 Games Reset', value: `${gamesReset}/${totalGames}`, inline: true },
        { name: '📊 Standings', value: standingsReset ? 'Reset to 0-0' : 'Recalculated', inline: true },
        { name: '📰 Announcements', value: type === 'full' ? `${announcementsCleared} cleared` : 'Not cleared', inline: true }
      )
      .setDescription(
        `All teams are now **0-0**\n` +
        `All games are now **"To be played"**\n\n` +
        `To restore this backup:\n\`/admin restore_backup backup_id:${backupId}\``
      )
      .setFooter({ text: `Reset by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({
      content: progressMsg,
      embeds: [successEmbed]
    });

  } catch (error) {
    console.error('Error resetting season:', error);
    await interaction.editReply(`❌ **Reset failed!**\n\nError: \`${error.message}\``);
  }
}

// ───────────────────────────────────────────────────────
// HELPER: PUBLISH SCHEDULE FROM RESET
// ───────────────────────────────────────────────────────

async function publishScheduleFromReset(channel, schedule, season) {
  try {
    console.log(`📤 Publishing schedule in ${channel.name}...`);

    // Publish header
    const headerEmbed = new EmbedBuilder()
      .setTitle('📅 NBA FANTASY LEAGUE CALENDAR')
      .setDescription(`**Season ${season}**\n\nSchedule for ${schedule.format} games per team (${schedule.total_games} total games).`)
      .setColor(0x1D428A)
      .setFooter({ text: 'Use /result add to enter game results' })
      .setTimestamp();

    await channel.send({ embeds: [headerEmbed] });

    // Group games by round
    const gamesByRound = {};
    for (const game of schedule.games) {
      if (!gamesByRound[game.round]) {
        gamesByRound[game.round] = [];
      }
      gamesByRound[game.round].push(game);
    }

    // Publish each round (max 10 rounds per message to avoid Discord limits)
    const rounds = Object.keys(gamesByRound).sort((a, b) => parseInt(a) - parseInt(b));
    
    // Store message IDs for later updates
    const calendarMessages = {};
    
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const games = gamesByRound[round];
      
      let roundText = `**🏀 TURNO ${round}**\n\n`;
      
      games.forEach(game => {
        const homeTeam = formatTeamName(game.home_team);
        const awayTeam = formatTeamName(game.away_team);
        const status = game.played ? `✅ ${game.home_score}-${game.away_score}` : '⏳ Da giocare';
        roundText += `• ${homeTeam} vs ${awayTeam} - ${status}\n`;
      });

      const roundEmbed = new EmbedBuilder()
        .setDescription(roundText)
        .setColor(0x0099FF);

      const message = await channel.send({ embeds: [roundEmbed] });
      
      // Save message ID for this round
      calendarMessages[round] = message.id;
    }

    // Save message IDs in database for later updates
    const admin = require('firebase-admin');
    const db = admin.firestore();
    await db.collection('schedules').doc(season).update({
      calendar_messages: calendarMessages,
      calendar_channel_id: channel.id
    });

    console.log(`✅ Schedule published successfully in ${channel.name}`);
  } catch (error) {
    console.error('Error publishing schedule:', error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────
// HELPER: CLEAR ANNOUNCEMENTS CHANNEL
// ───────────────────────────────────────────────────────

async function clearAnnouncementsChannel(guild) {
  try {
    const announcementsChannel = guild.channels.cache.find(ch =>
      ch.name === '📰-announcements' || ch.name.includes('announcements')
    );

    if (!announcementsChannel) {
      console.warn('Announcements channel not found');
      return 0;
    }

    let totalCleared = 0;
    let fetched;

    do {
      fetched = await announcementsChannel.messages.fetch({ limit: 100 });
      
      if (fetched.size > 0) {
        await announcementsChannel.bulkDelete(fetched);
        totalCleared += fetched.size;
      }
    } while (fetched.size >= 100);

    console.log(`✅ Cleared ${totalCleared} messages from announcements`);
    return totalCleared;

  } catch (error) {
    console.error('Error clearing announcements:', error);
    return 0;
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