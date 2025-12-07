// ═══════════════════════════════════════════════════════
// RESTORE BACKUP COMMAND - Restore from backup
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { restoreBackup, listBackups } = require('../../services/backupService');
const { refreshStandingsEmbeds } = require('../../services/standingsDisplayService');

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore from backup')
    .addSubcommand(subcommand =>
      subcommand
        .setName('backup')
        .setDescription('Restore season from backup')
        .addStringOption(option =>
          option
            .setName('backup_id')
            .setDescription('Backup ID to restore')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('confirm')
            .setDescription('Type CONFIRM to proceed')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List available backups')
        .addStringOption(option =>
          option
            .setName('season')
            .setDescription('Filter by season (optional)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of backups to show (default: 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'backup') {
      await restoreFromBackup(interaction);
    } else if (subcommand === 'list') {
      await listAvailableBackups(interaction);
    }
  },
};

// ───────────────────────────────────────────────────────
// RESTORE FROM BACKUP
// ───────────────────────────────────────────────────────

async function restoreFromBackup(interaction) {
  await interaction.deferReply();

  const backupId = interaction.options.getString('backup_id');
  const confirm = interaction.options.getString('confirm');

  // ─────────────────────────────────────────────────────
  // STEP 1: Verify confirmation
  // ─────────────────────────────────────────────────────

  if (confirm !== 'CONFIRM') {
    await interaction.editReply({
      content: `❌ **Restore cancelled!**\n\nYou must type exactly \`CONFIRM\` to proceed.\nYou typed: \`${confirm}\``,
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
      content: '❌ Only Commissioner can restore backups!',
      ephemeral: true
    });
    return;
  }

  try {
    let progressMsg = `🔄 **RESTORING BACKUP**\n\n`;
    progressMsg += `**Backup ID:** \`${backupId}\`\n\n`;
    progressMsg += `**Step 1/4:** Loading backup... ⏳`;

    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 3: Restore backup
    // ─────────────────────────────────────────────────────

    const restoreResult = await restoreBackup(backupId);

    if (!restoreResult.success) {
      await interaction.editReply(`❌ **Restore failed!**\n\nBackup not found: \`${backupId}\``);
      return;
    }

    const season = restoreResult.season;

    progressMsg = progressMsg.replace('Loading backup... ⏳', 'Loading backup... ✅');
    progressMsg += `\n**Step 2/4:** Restoring schedule... ⏳`;
    await interaction.editReply(progressMsg);

    // Schedule already restored in restoreBackup()
    
    progressMsg = progressMsg.replace('Restoring schedule... ⏳', 'Restoring schedule... ✅');
    progressMsg += `\n**Step 3/4:** Restoring standings... ⏳`;
    await interaction.editReply(progressMsg);

    // Standings already restored in restoreBackup()

    progressMsg = progressMsg.replace('Restoring standings... ⏳', 'Restoring standings... ✅');
    progressMsg += `\n**Step 4/4:** Updating embeds... ⏳`;
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 4: Update embeds
    // ─────────────────────────────────────────────────────

    await refreshCalendarEmbeds(interaction.guild, season);
    await refreshStandingsEmbeds(season, interaction.guild);

    progressMsg = progressMsg.replace('Updating embeds... ⏳', 'Updating embeds... ✅');
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // DONE!
    // ─────────────────────────────────────────────────────

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ BACKUP RESTORED')
      .setColor(0x00FF00)
      .addFields(
        { name: '📦 Backup ID', value: `\`${backupId}\``, inline: false },
        { name: '📅 Season', value: season, inline: true },
        { name: '🎯 Games Restored', value: `${restoreResult.gamesRestored}`, inline: true },
        { name: '📊 Games Played', value: `${restoreResult.gamesPlayed}`, inline: true }
      )
      .setDescription(
        `Schedule and standings have been restored to the state they were in when this backup was created.`
      )
      .setFooter({ text: `Restored by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({
      content: progressMsg,
      embeds: [successEmbed]
    });

  } catch (error) {
    console.error('Error restoring backup:', error);
    await interaction.editReply(`❌ **Restore failed!**\n\nError: \`${error.message}\``);
  }
}

// ───────────────────────────────────────────────────────
// LIST AVAILABLE BACKUPS
// ───────────────────────────────────────────────────────

async function listAvailableBackups(interaction) {
  await interaction.deferReply();

  const season = interaction.options.getString('season');
  const limit = interaction.options.getInteger('limit') || 10;

  try {
    const backups = await listBackups(season, limit);

    if (backups.length === 0) {
      await interaction.editReply({
        content: season ? 
          `📦 No backups found for season **${season}**` :
          `📦 No backups found`,
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📦 AVAILABLE BACKUPS')
      .setColor(0x0099FF)
      .setDescription(season ? `Showing backups for season **${season}**` : `Showing last ${limit} backups`)
      .setFooter({ text: `Total: ${backups.length} backup(s)` })
      .setTimestamp();

    for (const backup of backups) {
      const createdAt = backup.created_at?.toDate ? 
        backup.created_at.toDate().toLocaleString('it-IT') :
        'Unknown';

      embed.addFields({
        name: `${backup.backup_id}`,
        value: 
          `**Season:** ${backup.season}\n` +
          `**Type:** ${backup.type}\n` +
          `**Games:** ${backup.games_played}/${backup.games_count} played\n` +
          `**Created:** ${createdAt}\n` +
          `**Restore:** \`/restore backup backup_id:${backup.backup_id} confirm:CONFIRM\``,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error listing backups:', error);
    await interaction.editReply(`❌ **Error!**\n\n\`${error.message}\``);
  }
}

// ───────────────────────────────────────────────────────
// HELPER: REFRESH CALENDAR EMBEDS
// ───────────────────────────────────────────────────────

async function refreshCalendarEmbeds(guild, season) {
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    
    const scheduleDoc = await db.collection('schedules').doc(season).get();
    if (!scheduleDoc.exists) return;
    
    const schedule = scheduleDoc.data();
    const calendarMessages = schedule.calendar_messages;
    const calendarChannelId = schedule.calendar_channel_id;

    if (!calendarMessages || !calendarChannelId) return;

    const channel = guild.channels.cache.get(calendarChannelId);
    if (!channel) return;

    // Group games by round
    const gamesByRound = {};
    for (const game of schedule.games) {
      if (!gamesByRound[game.round]) {
        gamesByRound[game.round] = [];
      }
      gamesByRound[game.round].push(game);
    }

    // Update each round
    for (const [round, games] of Object.entries(gamesByRound)) {
      const messageId = calendarMessages[round];
      if (!messageId) continue;

      try {
        const message = await channel.messages.fetch(messageId);
        
        let roundText = `**🏀 TURNO ${round}**\n\n`;
        games.forEach(game => {
          const home = formatTeamName(game.home_team);
          const away = formatTeamName(game.away_team);
          const status = game.played ? `✅ ${game.home_score}-${game.away_score}` : '⏳ Da giocare';
          roundText += `• ${home} vs ${away} - ${status}\n`;
        });

        const { EmbedBuilder } = require('discord.js');
        const updatedEmbed = new EmbedBuilder()
          .setDescription(roundText)
          .setColor(0x0099FF);

        await message.edit({ embeds: [updatedEmbed] });
      } catch (error) {
        console.error(`Failed to update Round ${round}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error refreshing calendar:', error);
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