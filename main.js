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
const TEST_CMD = 'test';
const TESTPLAY_CMD = 'testplay';
const STOP_CMD = 'stop';

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

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log('Indexing media...')
  await loadMediaFiles();
  console.log('')
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === `${PREFIX}${TEST_CMD}`) {
    const sent = await message.reply('Working on it…');
    await sent.edit(
      `✅ Test successful! 🏓 Latency: ${sent.createdTimestamp - message.createdTimestamp} ms`
    );
    return;
  }

  if (content === `${PREFIX}${TESTPLAY_CMD}`) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ You need to join a voice channel first!');
    }
    let MUSIC_FILE
    try {
        MUSIC_FILE = FILES[Math.floor(Math.random()*FILES.length)].path
        
      await fs.access(MUSIC_FILE);
    } catch {
      return message.reply('⚠️ Audio file `test.mp3` not found or inaccessible. Path:' + MUSIC_FILE);
    }

    try {
      
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);


      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
      });
      const resource = createAudioResource(MUSIC_FILE, { inputType: 'arbitrary' });

      connection.subscribe(player);
      player.play(resource);

      guildAudioMap.set(message.guild.id, { connection, player });

      await message.reply('▶️ Playing test.mp3…');

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        guildAudioMap.delete(message.guild.id);
        console.log('🔇 Playback finished, left voice channel.');
      });

      player.on('error', (error) => {
        console.error('❌ Audio player error:', error);
        connection.destroy();
        guildAudioMap.delete(message.guild.id);
      });
    } catch (error) {
      console.error('❌ Error connecting or playing audio:', error);
      message.reply('Something went wrong trying to play the file.');
    }
    return;
  }

  if (content === `${PREFIX}${STOP_CMD}`) {
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
  }
});


client.login(DISCORD_TOKEN);