// ═══════════════════════════════════════════════════════
// RESULT ADD COMMAND - Add game results
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('result')
    .setDescription('Game result management')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a game result')
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
        .addIntegerOption(option =>
          option
            .setName('home_score')
            .setDescription('Home team score')
            .setRequired(true)
            .setMinValue(0)
        )
        .addIntegerOption(option =>
          option
            .setName('away_score')
            .setDescription('Away team score')
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption(option =>
          option
            .setName('season')
            .setDescription('Season (default: current season)')
            .setRequired(false)
        )
    ),

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
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      await addResult(interaction);
    }
  },
};

// ───────────────────────────────────────────────────────
// ADD RESULT FUNCTION
// ───────────────────────────────────────────────────────

async function addResult(interaction) {
  await interaction.deferReply();

  const round = interaction.options.getInteger('round');
  const homeTeam = interaction.options.getString('home_team');
  const awayTeam = interaction.options.getString('away_team');
  const homeScore = interaction.options.getInteger('home_score');
  const awayScore = interaction.options.getInteger('away_score');
  const season = interaction.options.getString('season') || process.env.CURRENT_SEASON || '2025-26';

  try {
    const db = admin.firestore();

    // ─────────────────────────────────────────────────────
    // STEP 1: Fetch schedule
    // ─────────────────────────────────────────────────────

    const scheduleRef = db.collection('schedules').doc(season);
    const scheduleDoc = await scheduleRef.get();

    if (!scheduleDoc.exists) {
      await interaction.editReply(`❌ **Schedule not found!**\n\nSeason: ${season}\n\nUse \`/season setup_schedule\` to import a schedule first.`);
      return;
    }

    const scheduleData = scheduleDoc.data();
    const games = scheduleData.games;

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
        `**Matchup:** ${formatTeamName(homeTeam)} vs ${formatTeamName(awayTeam)}\n\n` +
        `Make sure the round and teams are correct.`
      );
      return;
    }

    const game = games[gameIndex];

    // ─────────────────────────────────────────────────────
    // STEP 3: Check if already played
    // ─────────────────────────────────────────────────────

    if (game.played) {
      await interaction.editReply(
        `⚠️ **Game already played!**\n\n` +
        `**Previous result:** ${formatTeamName(homeTeam)} ${game.home_score} - ${game.away_score} ${formatTeamName(awayTeam)}\n` +
        `**New result:** ${formatTeamName(homeTeam)} ${homeScore} - ${awayScore} ${formatTeamName(awayTeam)}\n\n` +
        `The result will be updated.`
      );
    }

    // ─────────────────────────────────────────────────────
    // STEP 4: Update game result
    // ─────────────────────────────────────────────────────

    games[gameIndex] = {
      ...game,
      home_score: homeScore,
      away_score: awayScore,
      played: true,
      played_at: new Date()
    };

    await scheduleRef.update({
      games: games,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    // ─────────────────────────────────────────────────────
    // STEP 5: Update standings (will be implemented)
    // ─────────────────────────────────────────────────────

    // TODO: Calculate and update standings
    // await updateStandings(season, homeTeam, awayTeam, homeScore, awayScore);

    // ─────────────────────────────────────────────────────
    // STEP 6: Send confirmation
    // ─────────────────────────────────────────────────────

    const winner = homeScore > awayScore ? homeTeam : awayTeam;
    const winnerScore = homeScore > awayScore ? homeScore : awayScore;
    const loserScore = homeScore > awayScore ? awayScore : homeScore;

    const resultEmbed = new EmbedBuilder()
      .setTitle('✅ RESULT ADDED')
      .setColor(homeScore > awayScore ? 0x00FF00 : (homeScore < awayScore ? 0xFF0000 : 0xFFFF00))
      .setDescription(`**Round ${round}**`)
      .addFields(
        { 
          name: `${formatTeamName(homeTeam)} (Home)`, 
          value: `**${homeScore}** ${homeScore > awayScore ? '🏆' : ''}`, 
          inline: true 
        },
        { 
          name: 'VS', 
          value: '-', 
          inline: true 
        },
        { 
          name: `${formatTeamName(awayTeam)} (Away)`, 
          value: `**${awayScore}** ${awayScore > homeScore ? '🏆' : ''}`, 
          inline: true 
        }
      )
      .setFooter({ text: `Game ID: ${game.game_id} | Season: ${season}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });

    // ─────────────────────────────────────────────────────
    // STEP 7: Update calendar embed for this round
    // ─────────────────────────────────────────────────────

    try {
      const calendarMessages = scheduleData.calendar_messages;
      const calendarChannelId = scheduleData.calendar_channel_id;

      if (calendarMessages && calendarMessages[round] && calendarChannelId) {
        const calendarioChannel = interaction.guild.channels.cache.get(calendarChannelId);
        
        if (calendarioChannel) {
          // Fetch the message for this round
          const roundMessage = await calendarioChannel.messages.fetch(calendarMessages[round]);
          
          if (roundMessage) {
            // Regenerate embed with updated results
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
            console.log(`✅ Updated calendar embed for Round ${round}`);
          }
        }
      }
    } catch (error) {
      console.error('⚠️ Failed to update calendar embed:', error.message);
      // Non blocca il flusso se l'update dell'embed fallisce
    }

    // ─────────────────────────────────────────────────────
    // STEP 8: Post announcement in #announcements channel
    // ─────────────────────────────────────────────────────

    const announcementsChannel = interaction.guild.channels.cache.find(ch =>
      ch.name === '📰-announcements' || ch.name.includes('announcements')
    );

    if (announcementsChannel) {
      const announceEmbed = new EmbedBuilder()
        .setTitle('🏀 GAME RESULT')
        .setDescription(
          `**Round ${round}**\n\n` +
          `${formatTeamName(homeTeam)} **${homeScore}** - **${awayScore}** ${formatTeamName(awayTeam)}\n\n` +
          `${homeScore > awayScore ? '🏆 ' + formatTeamName(homeTeam) : (awayScore > homeScore ? '🏆 ' + formatTeamName(awayTeam) : '🤝 Tie')}`
        )
        .setColor(0x1D428A)
        .setTimestamp();

      await announcementsChannel.send({ embeds: [announceEmbed] });
    }

  } catch (error) {
    console.error('Error adding result:', error);
    await interaction.editReply(`❌ **Error adding result!**\n\n\`${error.message}\``);
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