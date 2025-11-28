// ═══════════════════════════════════════════════════════
// DEPLOY COMMANDS - Register slash commands with Discord
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];

// Load all command files
const commandFolders = fs.readdirSync(path.join(__dirname, '../src/commands'));

for (const folder of commandFolders) {
  const commandsPath = path.join(__dirname, '../src/commands', folder);
  
  if (!fs.statSync(commandsPath).isDirectory()) continue;
  
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`✅ Loaded: ${command.data.name}`);
    }
  }
}

// Deploy commands
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);

    // Register commands to specific guild (faster for development)
    if (process.env.DISCORD_GUILD_ID) {
      const data = await rest.put(
        Routes.applicationGuildCommands(
          process.env.DISCORD_CLIENT_ID,
          process.env.DISCORD_GUILD_ID
        ),
        { body: commands },
      );

      console.log(`✅ Successfully reloaded ${data.length} guild commands.`);
    } else {
      // Register commands globally (takes up to 1 hour to propagate)
      const data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands },
      );

      console.log(`✅ Successfully reloaded ${data.length} global commands.`);
    }

  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
})();