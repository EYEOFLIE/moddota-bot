import bytes from 'bytes';
import { distanceInWords } from 'date-fns';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import { sendMessageToChannel } from '../discord';
import { botLoop } from '../utils';

const toBytes = (value: number) => bytes(value, { unitSeparator: ' ' });

const WATCH_CUSTOM_GAMES = [
  // TOP 10:
  1613886175, // DOTA AUTO CHESS
  1517661692, // Overthrow 2.0
  1092484716, // Battle of Mirkwood - Battle Royale
  1576297063, // Dota 12v12
  474619917, // GemTD
  1589674258, // Battle In The Universe
  500020226, // Angel Arena Reborn
  699441891, // Angel Arena Black Star
  469311655, // Roshpit Champions 3.8B
  1332364041, // Touhou Avatar Dream Battle

  // Extra
  469311655, // Roshpit Champions
  687495832, // Troll & Elves 2
  1350425247, // Dota IMBA
  473718711, // Crumbling Island Arena
  1337770201, // Boss Hunters
  1448982217, // Green Tea Dota
  600881584, // Comic's Heroes Wars
  1682370297, // Test 
];

if (process.env.NODE_ENV !== 'production') WATCH_CUSTOM_GAMES.push(934517567); // Angel Arena Black Star develop branch

interface File {
  lastUpdate: number;
  size: number;
  title: string;
  previewUrl: string;
}

const API_URL = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const getCustomGames = async (ids: number[]) => {
  const body = new URLSearchParams();
  ids.forEach((id, i) => body.append(`publishedfileids[${i}]`, String(id)));
  body.append('itemcount', String(ids.length));

  const { response } = await (await fetch(API_URL, { method: 'POST', body })).json();
  if (response.result !== 1) throw new Error(`Steam API Result: ${response.result}`);

  const files: Record<string, File> = {};
  response.publishedfiledetails.forEach((file: any) => {
    const id = file.publishedfileid;
    if (file.result !== 1) throw new Error(`Steam API Result for file ${id}: ${file.result}`);

    files[id] = {
      lastUpdate: file.time_updated,
      size: file.file_size,
      title: file.title,
      previewUrl: file.preview_url,
    };
  });

  return files;
};

const CHANGELOG_URL_BASE = 'https://steamcommunity.com/sharedfiles/filedetails/changelog/';
const announceFileDiff = (id: string, oldFile: File, newFile: File) => {
  const timeDiff = newFile.lastUpdate - oldFile.lastUpdate;
  if (timeDiff === 0) return;
  if (timeDiff <= 60 * 60 * 24) {
    console.log(`[Custom Game Updates] Ignoring new update because it's ${timeDiff} old`);
    return;
  }

  const oldSize = toBytes(oldFile.size);
  const newSize = toBytes(newFile.size);
  const sizeChange = newFile.size - oldFile.size;
  const formattedSizeChange = (sizeChange > 0 ? '+' : '') + toBytes(sizeChange);
  const sizeMessage =
    sizeChange !== 0
      ? `_${oldSize}_ -> **${newSize}** (${formattedSizeChange})`
      : `**${newSize}** (not changed)`;

  sendMessageToChannel('dota2mods', {
    embed: {
      title: 'Custom Game Update',
      description: `**${newFile.title}**\n${sizeMessage}\nPrevious update ${distanceInWords(
        oldFile.lastUpdate * 1000,
        newFile.lastUpdate * 1000,
      )} ago`,
      url: CHANGELOG_URL_BASE + id,
      thumbnail: { url: newFile.previewUrl },
    },
  });
};

let oldCustomGames: Record<string, File> = {};
export const customGameUpdatesLoop = botLoop('Custom Game Updates', 30000, async () => {
  const newCustomGames = await getCustomGames(WATCH_CUSTOM_GAMES);
  try {
    Object.entries(newCustomGames)
      .filter(([id]) => oldCustomGames[id])
      .map(([id, newFile]) => announceFileDiff(id, oldCustomGames[id], newFile));
  } finally {
    oldCustomGames = newCustomGames;
  }
});
