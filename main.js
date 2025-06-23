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
  TESTPING: 'ping',
  PLAY: 'play',
  PLAY_STAGE: 'play-stage',
  STOP: 'stop',
  LIST: 'list',
  SKIP: 'skip'
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
  [COMMANDS.TESTPING]: async (message) => {
    const sent = await message.reply('Working on it…');
    await sent.edit(
      `✅ TESTPING successful! 🏓 Latency: ${sent.createdTimestamp - message.createdTimestamp} ms`
    );
  },

  [COMMANDS.PLAY]: async (message) => {
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
      console.error('❌ Error in PLAY command:', error);
      message.reply('Something went wrong trying to play the file.');
    }
  },

  [COMMANDS.PLAY_STAGE]: async (message) => {
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
      await playAudio(message, MUSIC_FILE, true, true); // true = loop, true = use stage channel
    } catch (error) {
      console.error('❌ Error in PLAY_STAGE command:', error);
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
      audioData.isPlaying = false; // Stop the loop
      audioData.player.stop(true);
      audioData.connection.destroy();
      
      // Delete the luma-music channel if it exists
      if (audioData.createdChannel) {
        try {
          // If it's a stage channel, delete the stage instance first
          if (audioData.isStage && audioData.createdChannel.stageInstance) {
            await audioData.createdChannel.stageInstance.delete();
            console.log('🗑️ Deleted stage instance');
          }
          
          await audioData.createdChannel.delete();
          console.log(`🗑️ Deleted ${audioData.isStage ? 'stage' : 'voice'} channel`);
        } catch (error) {
          console.error(`❌ Error deleting ${audioData.isStage ? 'stage' : 'voice'} channel:`, error);
        }
      }
      
      guildAudioMap.delete(guildId);
      await message.reply('🛑 Playback stopped, disconnected, and cleaned up channels.');
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
  },

  [COMMANDS.SKIP]: async (message) => {
    const guildId = message.guild?.id;
    if (!guildId) return;

    const audioData = guildAudioMap.get(guildId);
    if (!audioData) {
      return message.reply('❌ I am not currently playing anything to skip.');
    }

    if (FILES.length === 0) {
      return message.reply('❌ No audio files found in the media directory.');
    }

    // Get a new random file
    const MUSIC_FILE = FILES[Math.floor(Math.random() * FILES.length)];
    
    try {
      await fs.access(MUSIC_FILE.path);
    } catch {
      return message.reply('⚠️ Audio file not found or inaccessible at path: ' + MUSIC_FILE.path);
    }

    try {
      // Update the current audio data with new file
      audioData.musicFile = MUSIC_FILE;
      
      // Stop current playback and start new track
      audioData.player.stop();
      
      // The playback will automatically restart with the new track due to the loop logic
      await message.reply(`⏭️ Skipped to **${MUSIC_FILE.nameWithoutExt}** (🔄 Looping)…`);
    } catch (error) {
      console.error('❌ Error in skip command:', error);
      message.reply('Something went wrong trying to skip the track.');
    }
  }
};

// Unified audio playing function with loop support
async function playAudio(message, musicFile, shouldLoop = false, useStage = false) {
  const guild = message.guild;
  
  const channelName = useStage ? 'luma-music-stage' : 'luma-music';
  const channelType = useStage ? 13 : 2; // 13 = GUILD_STAGE_VOICE, 2 = GUILD_VOICE
  
  // Check if channel already exists
  let voiceChannel = guild.channels.cache.find(channel => 
    channel.name === channelName && channel.type === channelType
  );
  
  // Create channel if it doesn't exist
  if (!voiceChannel) {
    try {
      const channelOptions = {
        name: channelName,
        type: channelType,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone role
            deny: useStage ? ['RequestToSpeak'] : ['Speak'], // Stage channels use RequestToSpeak
            allow: ['ViewChannel', 'Connect']
          },
          {
            id: message.client.user.id, // Bot's permissions
            allow: useStage 
              ? ['ViewChannel', 'Connect', 'Speak', 'RequestToSpeak', 'ManageChannels']
              : ['ViewChannel', 'Connect', 'Speak']
          }
        ]
      };

      voiceChannel = await guild.channels.create(channelOptions);
      
      // If it's a stage channel, start a stage instance
      if (useStage) {
        try {
          await voiceChannel.createStageInstance({
            topic: '🎵 Luma Music Station',
            privacyLevel: 1 // GUILD_ONLY
          });
          console.log('� Created stage instance for luma-music-stage');
        } catch (stageError) {
          console.error('❌ Error creating stage instance:', stageError);
          // Continue anyway, the channel still works as a voice channel
        }
      }
      
      console.log(`🎵 Created ${useStage ? 'stage' : 'voice'} channel: ${channelName}`);
    } catch (error) {
      console.error(`❌ Error creating ${useStage ? 'stage' : 'voice'} channel:`, error);
      return message.reply(`❌ Failed to create ${useStage ? 'stage' : 'music'} channel. Please check bot permissions.`);
    }
  }
  
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  // If it's a stage channel, make the bot a speaker
  if (useStage) {
    try {
      // Wait a moment for the connection to fully establish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Set the bot as a speaker in the stage
      const member = guild.members.cache.get(message.client.user.id);
      if (member && member.voice.channel) {
        // Suppress the bot (make it a speaker)
        await member.voice.setSuppressed(false);
        console.log('🎤 Bot is now a speaker in the stage channel');
      }
    } catch (speakerError) {
      console.error('❌ Error making bot a speaker:', speakerError);
      // Continue anyway, audio might still work
    }
  }

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
  });

  // Store audio data with loop information and created channel reference
  const audioData = { 
    connection, 
    player, 
    musicFile, 
    shouldLoop,
    isPlaying: true,
    createdChannel: voiceChannel, // Store reference to delete later
    isStage: useStage
  };
  guildAudioMap.set(message.guild.id, audioData);

  const playTrack = () => {
    const resource = createAudioResource(musicFile.path, { inputType: 'arbitrary' });
    connection.subscribe(player);
    player.play(resource);
  };

  // Initial play
  playTrack();
  const channelTypeText = useStage ? 'stage' : 'channel';
  await message.reply(`▶️ Playing music in <#${voiceChannel.id}> ${channelTypeText} now...`);

  // Handle playback events
  player.on(AudioPlayerStatus.Idle, () => {
    const currentAudioData = guildAudioMap.get(message.guild.id);
    if (currentAudioData && currentAudioData.shouldLoop && currentAudioData.isPlaying) {
      // Use the current musicFile from audioData (might have been updated by skip)
      const currentMusicFile = currentAudioData.musicFile;
      console.log(`🔄 Looping: ${currentMusicFile.name}`);
      
      // Create new resource with the current music file
      const resource = createAudioResource(currentMusicFile.path, { inputType: 'arbitrary' });
      connection.subscribe(player);
      player.play(resource);
    } else {
      // Clean up when stopping
      connection.destroy();
      
      // Delete the luma-music channel if it exists
      if (currentAudioData && currentAudioData.createdChannel) {
        // If it's a stage channel, delete the stage instance first
        if (currentAudioData.isStage && currentAudioData.createdChannel.stageInstance) {
          currentAudioData.createdChannel.stageInstance.delete()
            .then(() => console.log('🗑️ Deleted stage instance'))
            .catch(error => console.error('❌ Error deleting stage instance:', error));
        }
        
        currentAudioData.createdChannel.delete()
          .then(() => console.log(`🗑️ Deleted ${currentAudioData.isStage ? 'stage' : 'voice'} channel on playback end`))
          .catch(error => console.error('❌ Error deleting channel on idle:', error));
      }
      
      guildAudioMap.delete(message.guild.id);
      console.log('🔇 Playback finished, left voice channel.');
    }
  });

  player.on('error', (error) => {
    console.error('❌ Audio player error:', error);
    const currentAudioData = guildAudioMap.get(message.guild.id);
    
    connection.destroy();
    
    // Delete the luma-music channel if it exists
    if (currentAudioData && currentAudioData.createdChannel) {
      // If it's a stage channel, delete the stage instance first
      if (currentAudioData.isStage && currentAudioData.createdChannel.stageInstance) {
        currentAudioData.createdChannel.stageInstance.delete()
          .then(() => console.log('🗑️ Deleted stage instance due to error'))
          .catch(error => console.error('❌ Error deleting stage instance on error:', error));
      }
      
      currentAudioData.createdChannel.delete()
        .then(() => console.log(`🗑️ Deleted ${currentAudioData.isStage ? 'stage' : 'voice'} channel due to error`))
        .catch(error => console.error('❌ Error deleting channel on error:', error));
    }
    
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