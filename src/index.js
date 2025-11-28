// ═══════════════════════════════════════════════════════
// NBA FANTASY LEAGUE BOT - MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { initializeDatabase } = require('./database/firebase');

// ───────────────────────────────────────────────────────
// INITIALIZE DISCORD CLIENT
// ───────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ───────────────────────────────────────────────────────
// COMMANDS COLLECTION
// ───────────────────────────────────────────────────────

client.commands = new Collection();

// Load command files from all subdirectories
const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));

for (const folder of commandFolders) {
  const commandsPath = path.join(__dirname, 'commands', folder);
  
  // Check if it's a directory
  if (!fs.statSync(commandsPath).isDirectory()) continue;
  
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
      console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property`);
    }
  }
}

// ───────────────────────────────────────────────────────
// EVENT HANDLERS
// ───────────────────────────────────────────────────────

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  
  console.log(`✅ Loaded event: ${event.name}`);
}

// ───────────────────────────────────────────────────────
// ERROR HANDLING
// ───────────────────────────────────────────────────────

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// ───────────────────────────────────────────────────────
// INITIALIZE & START BOT
// ───────────────────────────────────────────────────────

async function start() {
  try {
    console.log('🚀 Starting NBA Fantasy League Bot...');
    
    // Initialize database connection
    console.log('📊 Connecting to database...');
    await initializeDatabase();
    console.log('✅ Database connected');
    
    // Login to Discord
    console.log('🔐 Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
start();

// Export client for use in other modules
module.exports = { client };