import { Client, GatewayIntentBits, Partials } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import 'dotenv/config';
import { FILE } from 'dns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { DISCORD_TOKEN } = process.env;
const { ENVIRONMENT } = process.env

const PREFIX = '!';

// Command definitions for better management
const COMMANDS = {
  TEST: 'test',
  TESTPLAY: 'testplay',
  STOP: 'stop',
  LIST: 'list'
};

let MEDIA_PATH
if(ENVIRONMENT === 'dev'){
    MEDIA_PATH = "./music/"; // For Development
}else {
    MEDIA_PATH = "/mnt/fusion/discord-bot-music/background/" // For production
}




let FILES = []

// Function to scan media directory and populate FILES array
async function loadMediaFiles() {
  try {
    const files = await fs.readdir(MEDIA_PATH);
    FILES = files
      .filter(file => {
        // Filter for common audio file extensions
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext);
      })
      .map(file => ({
        name: file,
        path: path.join(MEDIA_PATH, file),
        nameWithoutExt: path.basename(file, path.extname(file))
      }));
    
    console.log(`📁 Loaded ${FILES.length} audio files from media directory`);
    FILES.forEach(file => console.log(`  - ${file.name}`));
  } catch (error) {
    console.error('❌ Error loading media files:', error);
    FILES = []; // Keep FILES as empty array if directory can't be read
  }

}



const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});


const guildAudioMap = new Map();

// Command handlers for better organization
const commandHandlers = {
  [COMMANDS.TEST]: async (message) => {
    const sent = await message.reply('Working on it…');
    await sent.edit(
      `✅ Test successful! 🏓 Latency: ${sent.createdTimestamp - message.createdTimestamp} ms`
    );
  },

  [COMMANDS.TESTPLAY]: async (message) => {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ You need to join a voice channel first!');
    }

    if (FILES.length === 0) {
      return message.reply('❌ No audio files found in the media directory.');
    }

    const MUSIC_FILE = FILES[Math.floor(Math.random() * FILES.length)];
    
    try {
      await fs.access(MUSIC_FILE.path);
    } catch {
      return message.reply('⚠️ Audio file not found or inaccessible at path: ' + MUSIC_FILE.path);
    }

    try {
      await playAudio(message, MUSIC_FILE, true); // true = loop by default
    } catch (error) {
      console.error('❌ Error in testplay command:', error);
      message.reply('Something went wrong trying to play the file.');
    }
  },

  [COMMANDS.STOP]: async (message) => {
    const guildId = message.guild?.id;
    if (!guildId) return;

    const audioData = guildAudioMap.get(guildId);
    if (!audioData) {
      return message.reply('❌ I am not currently playing anything.');
    }

    try {
      audioData.player.stop(true);
      audioData.connection.destroy();
      guildAudioMap.delete(guildId);
      await message.reply('🛑 Playback stopped and disconnected.');
    } catch (error) {
      console.error('❌ Error stopping playback:', error);
      message.reply('Something went wrong trying to stop playback.');
    }
  },

  [COMMANDS.LIST]: async (message) => {
    if (FILES.length === 0) {
      return message.reply('❌ No audio files found in the media directory.');
    }
    
    const fileList = FILES.slice(0, 20) // Limit to first 20 files to avoid message length issues
      .map((file, index) => `${index + 1}. ${file.nameWithoutExt}`)
      .join('\n');
    
    const totalFiles = FILES.length;
    const displayMessage = totalFiles > 20 
      ? `🎵 **Available files** (showing first 20 of ${totalFiles}):\n\`\`\`\n${fileList}\n\`\`\``
      : `🎵 **Available files** (${totalFiles} total):\n\`\`\`\n${fileList}\n\`\`\``;
    
    return message.reply(displayMessage);
  }
};

// Unified audio playing function with loop support
async function playAudio(message, musicFile, shouldLoop = false) {
  const voiceChannel = message.member.voice.channel;
  
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
  });

  // Store audio data with loop information
  const audioData = { 
    connection, 
    player, 
    musicFile, 
    shouldLoop,
    isPlaying: true 
  };
  guildAudioMap.set(message.guild.id, audioData);

  const playTrack = () => {
    const resource = createAudioResource(musicFile.path, { inputType: 'arbitrary' });
    connection.subscribe(player);
    player.play(resource);
  };

  // Initial play
  playTrack();

  const loopText = shouldLoop ? ' (🔄 Looping)' : '';
  await message.reply(`▶️ Playing **${musicFile.nameWithoutExt}**${loopText}…`);

  // Handle playback events
  player.on(AudioPlayerStatus.Idle, () => {
    const currentAudioData = guildAudioMap.get(message.guild.id);
    if (currentAudioData && currentAudioData.shouldLoop && currentAudioData.isPlaying) {
      console.log(`🔄 Looping: ${musicFile.name}`);
      playTrack(); // Restart the same track
    } else {
      connection.destroy();
      guildAudioMap.delete(message.guild.id);
      console.log('🔇 Playback finished, left voice channel.');
    }
  });

  player.on('error', (error) => {
    console.error('❌ Audio player error:', error);
    connection.destroy();
    guildAudioMap.delete(message.guild.id);
  });
}

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log('Indexing media...')
  await loadMediaFiles();
  console.log('')
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  
  // Check if message starts with prefix
  if (!content.startsWith(PREFIX)) return;
  
  // Extract command from message
  const command = content.slice(PREFIX.length);
  
  // Find and execute command handler
  const handler = commandHandlers[command];
  if (handler) {
    try {
      await handler(message);
    } catch (error) {
      console.error(`❌ Error executing command ${command}:`, error);
      message.reply('❌ Something went wrong executing that command.');
    }
  }
});


client.login(DISCORD_TOKEN);