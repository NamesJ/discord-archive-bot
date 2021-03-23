require('dotenv').config()

const discordApiToken = process.env.DISCORD_API_TOKEN;
//const archivedChannels = process.env.DISCORD_ARCHIVED_CHANNELS ? JSON.parse(process.env.DISCORD_ARCHIVED_CHANNELS) : ['archives', 'backup']
var archivedChannels;
if (process.env.DISCORD_ARCHIVED_CHANNELS) {
    archivedChannels = JSON.parse(process.env.DISCORD_ARCHIVED_CHANNELS);
} else {
    archivedChannels = ['archives'];
}

// Dev Note: add more general path handling (e.g. windows)
const rootPath = process.env.ROOT_PATH || '.';
const archiveDir = `${rootPath}/${process.env.ARCHIVE_DIR || 'archived'}`;
const ipfsClientConfig = {
  host: process.env.IPFS_HOST || 'localhost',
  port: process.env.IPFS_PORT || '5001',
  protocol: process.env.IPFS_PROTOCOL || 'http',
};
const ipfsCidVersion = parseInt(process.env.IPFS_CID_VERSION) || 1;

const https = require('https');
const fs = require('fs');
const url = require('url');
const path = require('path');
var request = require('request').defaults({ encoding: null });

const Discord = require('discord.js');
const discordClient = new Discord.Client();

const ipfsClient = require('ipfs-http-client');
const ipfs = ipfsClient(ipfsClientConfig);


// DEV NOTE: pin the file
const addFile = async (fileName, filePath) => {
  const file = fs.readFileSync(filePath);
  const fileAdded = await ipfs.add(
    { path: fileName, content: file },
    { cidVersion: ipfsCidVersion }
  );
  const fileHash = fileAdded.cid.toString();

  return fileHash;
};


const archiveMessage = async (msg) => {
  // get attachments as normal array (instead of raw array)
  const attachments = (msg.attachments).array();

  // archive each attached file
  for (let i=0; i<attachments.length; i++) {
    const fileName = attachments[i].name;
    const filePath = `${archiveDir}/${msg.id}_${fileName}`

    // Download file and save locally
    const file = fs.createWriteStream(filePath);
    const request = await https.get(attachments[i].url, response => {
      response.pipe(file);
    });
    file.on('finish', async () => {
      // add file to IPFS node
      const fileHash = await addFile(fileName, filePath);

      // create ipfs links
      const ipfsUrl = `ipfs://${fileHash}`
      const gatewayUrl = `https://ipfs.io/ipfs/${fileHash}`;

      fs.unlink(filePath, (err) => {
        if (err) {
          console.log(err);
          return;
        }
      })

      // Create a file with the name of the CID
      const hashFilePath = `${archiveDir}/${fileHash}.json`;

      fs.access(hashFilePath, fs.F_OK, async (err) => {
        if (err) {
          const hashNamedFile = fs.createWriteStream(hashFilePath);

          await hashNamedFile.write(JSON.stringify({
            fileName: fileName,
            gatewayUrl: gatewayUrl,
          }));

          return;
        }
      });

      // Reply to original message with IPFS links
      msg.reply(`${fileName} archived to ${ipfsUrl}\nGateway: ${gatewayUrl}`);
    });
  }
};


discordClient.on('message', async (msg) => {
  // Ignore own messages
  if (msg.author.bot) return;

  // Archive attachments sent in archived channels
  if (archivedChannels.includes(msg.channel.name) && msg.attachments.size) {
    archiveMessage(msg);
  }
});

// Initalize archived directory
if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);

discordClient.login(discordApiToken);
