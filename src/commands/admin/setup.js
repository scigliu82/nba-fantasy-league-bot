// ═══════════════════════════════════════════════════════
// SETUP COMMAND - Automatic Discord server setup (OPTIMIZED)
// ═══════════════════════════════════════════════════════

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

// ───────────────────────────────────────────────────────
// NBA TEAMS DATA
// ───────────────────────────────────────────────────────

const NBA_TEAMS = [
  // Eastern Conference - Atlantic
  { id: 'celtics', name: 'Boston Celtics', emoji: '🟢', color: 0x007A33 },
  { id: 'nets', name: 'Brooklyn Nets', emoji: '⚫', color: 0x000000 },
  { id: 'knicks', name: 'New York Knicks', emoji: '🔵', color: 0x006BB6 },
  { id: 'sixers', name: 'Philadelphia 76ers', emoji: '🔴', color: 0x006BB6 },
  { id: 'raptors', name: 'Toronto Raptors', emoji: '🔴', color: 0xCE1141 },
  
  // Eastern Conference - Central
  { id: 'bulls', name: 'Chicago Bulls', emoji: '🔴', color: 0xCE1141 },
  { id: 'cavaliers', name: 'Cleveland Cavaliers', emoji: '🍷', color: 0x860038 },
  { id: 'pistons', name: 'Detroit Pistons', emoji: '🔵', color: 0xC8102E },
  { id: 'pacers', name: 'Indiana Pacers', emoji: '🟡', color: 0x002D62 },
  { id: 'bucks', name: 'Milwaukee Bucks', emoji: '🟢', color: 0x00471B },
  
  // Eastern Conference - Southeast
  { id: 'hawks', name: 'Atlanta Hawks', emoji: '🔴', color: 0xE03A3E },
  { id: 'hornets', name: 'Charlotte Hornets', emoji: '🐝', color: 0x1D1160 },
  { id: 'heat', name: 'Miami Heat', emoji: '🔥', color: 0x98002E },
  { id: 'magic', name: 'Orlando Magic', emoji: '⭐', color: 0x0077C0 },
  { id: 'wizards', name: 'Washington Wizards', emoji: '🔵', color: 0x002B5C },
  
  // Western Conference - Northwest
  { id: 'nuggets', name: 'Denver Nuggets', emoji: '⛰️', color: 0x0E2240 },
  { id: 'timberwolves', name: 'Minnesota Timberwolves', emoji: '🐺', color: 0x0C2340 },
  { id: 'thunder', name: 'Oklahoma City Thunder', emoji: '⚡', color: 0x007AC1 },
  { id: 'blazers', name: 'Portland Trail Blazers', emoji: '🔴', color: 0xE03A3E },
  { id: 'jazz', name: 'Utah Jazz', emoji: '🎵', color: 0x002B5C },
  
  // Western Conference - Pacific
  { id: 'warriors', name: 'Golden State Warriors', emoji: '🔵', color: 0x1D428A },
  { id: 'clippers', name: 'LA Clippers', emoji: '🔴', color: 0xC8102E },
  { id: 'lakers', name: 'Los Angeles Lakers', emoji: '💜', color: 0x552583 },
  { id: 'suns', name: 'Phoenix Suns', emoji: '🌞', color: 0x1D1160 },
  { id: 'kings', name: 'Sacramento Kings', emoji: '👑', color: 0x5A2D81 },
  
  // Western Conference - Southwest
  { id: 'mavericks', name: 'Dallas Mavericks', emoji: '🐴', color: 0x00538C },
  { id: 'rockets', name: 'Houston Rockets', emoji: '🚀', color: 0xCE1141 },
  { id: 'grizzlies', name: 'Memphis Grizzlies', emoji: '🐻', color: 0x5D76A9 },
  { id: 'pelicans', name: 'New Orleans Pelicans', emoji: '🦅', color: 0x0C2340 },
  { id: 'spurs', name: 'San Antonio Spurs', emoji: '⚫', color: 0xC4CED4 },
];

// ───────────────────────────────────────────────────────
// COMMAND DEFINITION
// ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup Discord server for NBA Fantasy League')
    .addSubcommand(subcommand =>
      subcommand
        .setName('server')
        .setDescription('Create all channels, roles, and categories')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'server') {
      await setupServer(interaction);
    }
  },
};

// ───────────────────────────────────────────────────────
// SETUP SERVER FUNCTION (OPTIMIZED)
// ───────────────────────────────────────────────────────

async function setupServer(interaction) {
  // Defer reply immediately (gives us 15 minutes instead of 3 seconds)
  await interaction.deferReply({ ephemeral: false });

  const guild = interaction.guild;
  let progressMsg = '🚀 **NBA Fantasy League - Server Setup**\n\n';

  try {
    // ─────────────────────────────────────────────────────
    // STEP 1: Create roles
    // ─────────────────────────────────────────────────────
    
    progressMsg += '**Step 1/5:** Creating roles... ⏳';
    await interaction.editReply(progressMsg);

    const roles = {};

    // Create Commissioner role
    roles.commissioner = await guild.roles.create({
      name: 'Commissioner',
      color: 0xFFD700,
      permissions: [PermissionFlagsBits.Administrator],
      reason: 'NBA Fantasy League setup',
    });

    // Create all 30 GM roles
    for (const team of NBA_TEAMS) {
      const teamName = team.name.split(' ').pop(); // Get last word (Lakers, Celtics, etc)
      roles[team.id] = await guild.roles.create({
        name: `GM-${teamName}`,
        color: team.color,
        reason: 'NBA Fantasy League setup',
      });
    }

    progressMsg = progressMsg.replace('Creating roles... ⏳', 'Creating roles... ✅');
    progressMsg += '\n**Step 2/5:** Creating categories... ⏳';
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 2: Create categories
    // ─────────────────────────────────────────────────────

    const categoryPublic = await guild.channels.create({
      name: '📢 PUBLIC',
      type: ChannelType.GuildCategory,
      position: 0,
    });

    const categoryTeams = await guild.channels.create({
      name: '🏀 TEAM HEADQUARTERS',
      type: ChannelType.GuildCategory,
      position: 1,
    });

    const categoryAdmin = await guild.channels.create({
      name: '👑 ADMINISTRATION',
      type: ChannelType.GuildCategory,
      position: 2,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: roles.commissioner.id,
          allow: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });

    progressMsg = progressMsg.replace('Creating categories... ⏳', 'Creating categories... ✅');
    progressMsg += '\n**Step 3/5:** Creating public channels... ⏳';
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 3: Create public channels
    // ─────────────────────────────────────────────────────

    const publicChannels = [
      { name: '📜-rules', topic: 'League rules and guidelines' },
      { name: '📰-announcements', topic: 'Important league announcements', readOnly: true },
      { name: '💬-general-chat', topic: 'General discussion' },
      { name: '📊-standings', topic: 'Current league standings' },
      { name: '🔄-trade-block', topic: 'Discuss trades and view active trade proposals' },
      { name: '👥-free-agency', topic: 'Free agency discussions and signings' },
      { name: '⚠️-waiver-wire', topic: 'Waiver claims and transactions' },
    ];

    for (const channel of publicChannels) {
      const overwrites = [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
        },
      ];

      if (channel.readOnly) {
        overwrites.push(
          {
            id: guild.id,
            deny: [PermissionFlagsBits.SendMessages],
          },
          {
            id: roles.commissioner.id,
            allow: [PermissionFlagsBits.SendMessages],
          }
        );
      }

      await guild.channels.create({
        name: channel.name,
        type: ChannelType.GuildText,
        parent: categoryPublic.id,
        topic: channel.topic,
        permissionOverwrites: overwrites,
      });
    }

    progressMsg = progressMsg.replace('Creating public channels... ⏳', 'Creating public channels... ✅');
    progressMsg += '\n**Step 4/5:** Creating team channels... ⏳ (0/30)';
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 4: Create team channels (in batches)
    // ─────────────────────────────────────────────────────

    let count = 0;
    for (const team of NBA_TEAMS) {
      await guild.channels.create({
        name: `${team.emoji}-${team.id}-hq`,
        type: ChannelType.GuildText,
        parent: categoryTeams.id,
        topic: `Private HQ for ${team.name} GM`,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: roles[team.id].id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
          {
            id: roles.commissioner.id,
            allow: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });

      count++;
      
      // Update progress every 5 teams
      if (count % 5 === 0 || count === NBA_TEAMS.length) {
        progressMsg = progressMsg.replace(/Creating team channels\.\.\. ⏳ \(\d+\/30\)/, `Creating team channels... ⏳ (${count}/30)`);
        await interaction.editReply(progressMsg);
      }
    }

    progressMsg = progressMsg.replace(/Creating team channels\.\.\. ⏳ \(\d+\/30\)/, 'Creating team channels... ✅ (30/30)');
    progressMsg += '\n**Step 5/5:** Creating admin channels... ⏳';
    await interaction.editReply(progressMsg);

    // ─────────────────────────────────────────────────────
    // STEP 5: Create admin channel
    // ─────────────────────────────────────────────────────

    await guild.channels.create({
      name: '🛠️-commissioner-office',
      type: ChannelType.GuildText,
      parent: categoryAdmin.id,
      topic: 'Commissioner tools and league management',
    });

    progressMsg = progressMsg.replace('Creating admin channels... ⏳', 'Creating admin channels... ✅');

    // ─────────────────────────────────────────────────────
    // DONE!
    // ─────────────────────────────────────────────────────

    const successMessage = `
${progressMsg}

╔═══════════════════════════════════════════════════════╗
║           ✅ SERVER SETUP COMPLETED!                   ║
╚═══════════════════════════════════════════════════════╝

**Created:**
✅ **31 roles** (1 Commissioner + 30 GM roles)
✅ **3 categories** (Public, Team HQ, Admin)
✅ **38 channels** (7 public + 30 team + 1 admin)

**Roles created:**
- @Commissioner (admin)
- @GM-Lakers, @GM-Celtics, @GM-Warriors... (30 teams)

**Public channels:**
📜 rules | 📰 announcements | 💬 general-chat
📊 standings | 🔄 trade-block | 👥 free-agency | ⚠️ waiver-wire

**Team channels:** (private for each GM)
🏀 30 team HQ channels

**Next steps:**
1️⃣ Assign GM roles to users
2️⃣ Post rules in #📜-rules
3️⃣ Make announcements in #📰-announcements
4️⃣ Use \`/season start\` when ready!

🏀 **Your NBA Fantasy League is ready!** 🚀
    `;

    await interaction.editReply(successMessage);

  } catch (error) {
    console.error('Error setting up server:', error);
    await interaction.editReply(`❌ **Setup failed!**\n\nError: \`${error.message}\`\n\nMake sure the bot has **Administrator** permissions.`);
  }
}