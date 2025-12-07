// ═══════════════════════════════════════════════════════
// SETUP SCHEDULE COMMAND - Import season schedule
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('season')
    .setDescription('Season management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup_schedule')
        .setDescription('Import season schedule from Excel file')
        .addStringOption(option =>
          option
            .setName('format')
            .setDescription('Schedule format (games per team)')
            .setRequired(true)
            .addChoices(
              { name: '29 games (Fast)', value: '29' },
              { name: '58 games (Regular)', value: '58' },
              { name: '82 games (Full NBA)', value: '82' }
            )
        )
        .addStringOption(option =>
          option
            .setName('file_path')
            .setDescription('Path to Excel file (relative to bot root)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('season')
            .setDescription('Season year (e.g., 2025-26)')
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup_schedule') {
      await setupSchedule(interaction);
    }
  },
};

// ───────────────────────────────────────────────────────
// SETUP SCHEDULE FUNCTION
// ───────────────────────────────────────────────────────

async function setupSchedule(interaction) {
  await interaction.deferReply();

  const format = interaction.options.getString('format');
  const filePath = interaction.options.getString('file_path') || './data/calendario.xlsx';
  const season = interaction.options.getString('season') || process.env.CURRENT_SEASON || '2025-26';

  try {
    // ─────────────────────────────────────────────────────
    // STEP 1: Initial message
    // ─────────────────────────────────────────────────────
    
    let progressMsg = '⏳ **SETTING UP SEASON SCHEDULE**\n\n';
    progressMsg += `**Season:** ${season}\n`;
    progressMsg += `**Format:** ${format} games per team\n`;
    progressMsg += `**File:** \`${filePath}\`\n\n`;
    progressMsg += 'Please wait, this may take 30-60 seconds...';
    
    await interaction.editReply(progressMsg);

    const fullPath = path.resolve(filePath);
    
    if (!fs.existsSync(fullPath)) {
      await interaction.editReply({
        content: `❌ **File not found!**\n\nPath: \`${filePath}\`\n\n**Instructions:**\n1. Put your Excel file in the \`data/\` folder\n2. Name it \`calendario.xlsx\` (or specify path with \`file_path\` option)\n3. Run this command again`,
        ephemeral: true
      });
      return;
    }

    console.log('✅ Step 1/5: File exists');

    // ─────────────────────────────────────────────────────
    // STEP 2: Run import script
    // ─────────────────────────────────────────────────────

    const scriptPath = path.resolve('./scripts/importSchedule.js');
    const command = `node "${scriptPath}" "${fullPath}" "${season}"`;
    
    console.log(`🔧 Executing: ${command}`);
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr && !stderr.includes('ExperimentalWarning')) {
      console.error('Script stderr:', stderr);
    }
    
    console.log('Script output:', stdout);
    console.log('✅ Step 2/5: Schedule imported');

    // ─────────────────────────────────────────────────────
    // STEP 3: Fetch schedule from database
    // ─────────────────────────────────────────────────────

    const admin = require('firebase-admin');
    const db = admin.firestore();
    
    const scheduleDoc = await db.collection('schedules').doc(season).get();
    
    if (!scheduleDoc.exists) {
      await interaction.editReply('❌ **Import failed!** Schedule not found in database after import.');
      return;
    }
    
    const scheduleData = scheduleDoc.data();
    console.log('✅ Step 3/5: Schedule fetched from database');

    // ─────────────────────────────────────────────────────
    // STEP 4: Publish in #calendario channel
    // ─────────────────────────────────────────────────────

    const calendarioChannel = interaction.guild.channels.cache.find(ch => 
      ch.name === '📅-calendario' || ch.name.includes('calendario')
    );

    if (!calendarioChannel) {
      console.warn('⚠️  #calendario channel not found, skipping publication');
    } else {
      await publishSchedule(calendarioChannel, scheduleData, season);
    }
    
    console.log('✅ Step 4/5: Calendar published');

    // ─────────────────────────────────────────────────────
    // STEP 5: Initialize standings and publish
    // ─────────────────────────────────────────────────────

    const { initializeStandings } = require('../../services/standingsService');
    const { publishStandingsEmbeds } = require('../../services/standingsDisplayService');

    let standingsStatus = 'initialized';

    try {
      await initializeStandings(season);
      console.log('✅ Standings initialized for all 30 teams');
      
      const standingsChannel = interaction.guild.channels.cache.find(ch => 
        ch.name === '📊-standings' || ch.name.includes('standings')
      );
      
      if (standingsChannel) {
        await publishStandingsEmbeds(standingsChannel, season);
        console.log('✅ Step 5/5: Published 9 standings embeds');
      } else {
        console.warn('⚠️  #standings channel not found, skipping publication');
        standingsStatus = 'channel_not_found';
      }
    } catch (error) {
      console.error('⚠️ Failed to initialize standings:', error.message);
      standingsStatus = 'error';
    }

    // ─────────────────────────────────────────────────────
    // DONE!
    // ─────────────────────────────────────────────────────

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ SCHEDULE SETUP COMPLETE!')
      .setColor(0x00FF00)
      .setDescription(`Season **${season}** schedule has been imported successfully!`)
      .addFields(
        { name: '📊 Format', value: `${scheduleData.format} games per team`, inline: true },
        { name: '🎯 Total Games', value: `${scheduleData.total_games} games`, inline: true },
        { name: '🔄 Rounds', value: `${scheduleData.rounds} rounds`, inline: true },
        { name: '📅 Calendar', value: calendarioChannel ? `Published in <#${calendarioChannel.id}>` : '⚠️ Not published', inline: false },
        { name: '📊 Standings', value: standingsStatus === 'initialized' ? '✅ 9 classifications created' : (standingsStatus === 'channel_not_found' ? '⚠️ Channel not found' : '⚠️ Error'), inline: false }
      )
      .setFooter({ text: 'Use /result add to start entering game results' })
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    console.error('❌ Error setting up schedule:', error);
    
    // Shorten error message to avoid Discord's 2000 char limit
    let errorMsg = error.message;
    if (errorMsg.length > 1500) {
      errorMsg = errorMsg.substring(0, 1500) + '...\n\n(Error truncated - check bot logs for full details)';
    }
    
    await interaction.editReply(`❌ **Setup failed!**\n\nError: \`${errorMsg}\`\n\nCheck bot logs for details.`);
  }
}

// ───────────────────────────────────────────────────────
// PUBLISH SCHEDULE IN CHANNEL
// ───────────────────────────────────────────────────────

async function publishSchedule(channel, scheduleData, season) {
  try {
    console.log(`📤 Publishing schedule in ${channel.name}...`);

    // Delete old messages (cleanup)
    const messages = await channel.messages.fetch({ limit: 100 });
    if (messages.size > 0) {
      await channel.bulkDelete(messages).catch(err => {
        console.warn('Could not bulk delete old messages:', err.message);
      });
    }

    // Header embed
    const headerEmbed = new EmbedBuilder()
      .setTitle(`📅 CALENDARIO STAGIONE ${season.toUpperCase()}`)
      .setColor(0x1D428A)
      .setDescription(
        `**${scheduleData.format} partite per team** | **${scheduleData.total_games} partite totali** | **${scheduleData.rounds} turni**\n\n` +
        `Usa \`/result add\` per inserire i risultati delle partite.`
      )
      .setTimestamp();

    await channel.send({ embeds: [headerEmbed] });

    // Group games by round
    const gamesByRound = {};
    for (const game of scheduleData.games) {
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
// HELPER FUNCTIONS
// ───────────────────────────────────────────────────────

function formatTeamName(teamId) {
  const teamNames = {
    hawks: 'Atlanta Hawks',
    celtics: 'Boston Celtics',
    nets: 'Brooklyn Nets',
    hornets: 'Charlotte Hornets',
    bulls: 'Chicago Bulls',
    cavaliers: 'Cleveland Cavaliers',
    mavericks: 'Dallas Mavericks',
    nuggets: 'Denver Nuggets',
    pistons: 'Detroit Pistons',
    warriors: 'Golden State Warriors',
    rockets: 'Houston Rockets',
    pacers: 'Indiana Pacers',
    clippers: 'LA Clippers',
    lakers: 'Los Angeles Lakers',
    grizzlies: 'Memphis Grizzlies',
    heat: 'Miami Heat',
    bucks: 'Milwaukee Bucks',
    timberwolves: 'Minnesota Timberwolves',
    pelicans: 'New Orleans Pelicans',
    knicks: 'New York Knicks',
    thunder: 'Oklahoma City Thunder',
    magic: 'Orlando Magic',
    sixers: 'Philadelphia 76ers',
    suns: 'Phoenix Suns',
    blazers: 'Portland Trail Blazers',
    kings: 'Sacramento Kings',
    spurs: 'San Antonio Spurs',
    raptors: 'Toronto Raptors',
    jazz: 'Utah Jazz',
    wizards: 'Washington Wizards'
  };
  
  return teamNames[teamId] || teamId;
}