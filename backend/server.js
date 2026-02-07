// backend/server.js
// Single-process server:
// - HTTP serves the built frontend from ./public
// - WebSocket server is mounted at /ws on the same port

const path = require('path');
const http = require('http');
const express = require('express');

// Memory store for rooms
const rooms = {};

const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const app = express();
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// SPA fallback (serve index.html for non-file routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);

// WebSocket server on the same HTTP server (path: /ws)
const wss = new WebSocket.Server({ server, path: '/ws' });

const VOTES_PER_PLAYER = 10;
const BRACKET_SIZE = 16;
const SUBMISSION_DURATION_MS = 60_000;

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getRoomBySocket(socket) {
  if (socket.roomCode && rooms[socket.roomCode]) {
    return rooms[socket.roomCode];
  }
  return null;
}

function getPlayerEntry(room, socket) {
  return room.players.find(player => player.socket === socket);
}

function getPlayerSockets(room) {
  return room.players.map(player => player.socket);
}

function getPlayerNames(room) {
  return room.players
    .map(player => player.name)
    .filter(name => typeof name === 'string' && name.trim().length > 0);
}

function sanitizeItem(item) {
  if (typeof item !== 'string') return '';
  return item.trim();
}

function dedupeItems(items) {
  const seen = new Map();
  for (const raw of items) {
    const cleaned = sanitizeItem(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, cleaned);
    }
  }
  return Array.from(seen.values());
}

wss.on('connection', (socket) => {
  console.log('Client connected ✅');

  socket.on('message', (message) => {
    console.log('Received:', message.toString());

    try {
      const data = JSON.parse(message);

      if (data.action === 'create_room') {
        console.log(`Creating room with code ${data.roomCode}`);

        if (rooms[data.roomCode]) {
          console.log('Room already exists!');
          socket.send(JSON.stringify({ action: 'error', message: 'Room already exists.' }));
          return;
        }

        const hostToken = generateToken();

        rooms[data.roomCode] = {
          host: socket,
          hostToken,
          players: [],
          submissions: [],
          voteCounts: {},
          submittedPlayers: new Set(),
          bracket: [],
          completedBattles: new Set(),
          battleWinners: {},
          currentBattle: null,
          phase: 'lobby',
          category: '',
          submissionEndsAt: null,
          votingItems: [],
        };

        socket.role = 'host';
        socket.roomCode = data.roomCode;

        socket.send(JSON.stringify({
          action: 'room_created',
          roomCode: data.roomCode,
          hostToken,
          playerCount: 0,
        }));

        console.log(`Room ${data.roomCode} created successfully.`);
      } else if (data.action === 'join_room') {
        console.log(`Joining room with code ${data.roomCode}`);

        const room = rooms[data.roomCode];

        if (!room) {
          console.log('Room not found. Sending error back.');
          socket.send(JSON.stringify({ action: 'error', message: 'Room not found.' }));
          return;
        }

        const playerName = sanitizeItem(data.name || '');
        if (!playerName) {
          socket.send(JSON.stringify({ action: 'error', message: 'Player name required.' }));
          return;
        }

        if (!getPlayerEntry(room, socket)) {
          room.players.push({ socket, name: playerName });
        }

        socket.role = 'player';
        socket.roomCode = data.roomCode;
        socket.playerName = playerName;

        socket.send(JSON.stringify({
          action: 'join_ok',
          roomCode: data.roomCode,
          phase: room.phase,
          category: room.category,
          submissionEndsAt: room.submissionEndsAt,
        }));

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(JSON.stringify({
            action: 'player_count',
            count: room.players.length,
          }));
          room.host.send(JSON.stringify({
            action: 'player_list',
            players: getPlayerNames(room),
          }));
        }

        console.log(`Player joined room ${data.roomCode}. Total players: ${room.players.length}`);
      }
      else if (data.action === 'host_reconnect') {
        console.log(`Host reconnecting to room ${data.roomCode}`);

        const room = rooms[data.roomCode];
        if (!room) {
          console.log('Room not found during host reconnect.');
          socket.send(JSON.stringify({ action: 'error', message: 'Room not found.' }));
          return;
        }

        if (!data.hostToken || data.hostToken !== room.hostToken) {
          console.log('Invalid host token during reconnect.');
          socket.send(JSON.stringify({ action: 'error', message: 'Invalid host token.' }));
          return;
        }

        room.host = socket;
        socket.role = 'host';
        socket.roomCode = data.roomCode;

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(JSON.stringify({
            action: 'player_list',
            players: getPlayerNames(room),
          }));

          room.host.send(JSON.stringify({
            action: 'host_state',
            roomCode: data.roomCode,
            phase: room.phase,
            category: room.category,
            submissions: room.submissions,
            bracket: room.bracket,
            battleWinners: room.battleWinners,
            submissionEndsAt: room.submissionEndsAt,
            playerCount: room.players.length,
          }));
        }

        console.log(`Host successfully reattached to room ${data.roomCode}`);
      }
      else if (data.action === 'get_players') {
        const room = rooms[data.roomCode];
        if (!room) {
          socket.send(JSON.stringify({ action: 'error', message: 'Room not found.' }));
          return;
        }
        if (room.host !== socket) {
          return;
        }
        socket.send(JSON.stringify({
          action: 'player_list',
          players: getPlayerNames(room),
        }));
      }
      else if (data.action === 'start_submissions') {
        const room = getRoomBySocket(socket);
        if (!room || room.host !== socket) {
          console.log('Host not found for start_submissions.');
          return;
        }

        if (room.phase !== 'lobby') {
          return;
        }

        if (!data.category || !sanitizeItem(data.category)) {
          socket.send(JSON.stringify({ action: 'error', message: 'Category required.' }));
          return;
        }

        if (room.players.length === 0) {
          socket.send(JSON.stringify({ action: 'error', message: 'At least one player is required.' }));
          return;
        }

        room.phase = 'submissions';
        room.category = sanitizeItem(data.category || '');
        room.submissions = [];
        room.voteCounts = {};
        room.submittedPlayers = new Set();
        room.bracket = [];
        room.completedBattles = new Set();
        room.battleWinners = {};
        room.currentBattle = null;
        room.votingItems = [];
        room.submissionEndsAt = Date.now() + SUBMISSION_DURATION_MS;

        const payload = JSON.stringify({
          action: 'start_submissions',
          category: room.category,
          submissionEndsAt: room.submissionEndsAt,
        });

        getPlayerSockets(room).forEach(playerSocket => {
          if (playerSocket.readyState === WebSocket.OPEN) {
            playerSocket.send(payload);
          }
        });

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(payload);
        }

        console.log('Submissions phase started.');
      }
      else if (data.action === 'end_submissions') {
        const room = getRoomBySocket(socket);
        if (!room || room.host !== socket) {
          console.log('Host not found for end_submissions.');
          return;
        }

        room.phase = 'submissions_closed';
        room.submissionEndsAt = Date.now();

        const payload = JSON.stringify({
          action: 'submissions_ended',
          submissionEndsAt: room.submissionEndsAt,
        });

        getPlayerSockets(room).forEach(playerSocket => {
          if (playerSocket.readyState === WebSocket.OPEN) {
            playerSocket.send(payload);
          }
        });

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(payload);
        }
      }
      else if (data.action === 'submit_item') {
        const room = getRoomBySocket(socket);
        if (!room || socket.role !== 'player') {
          console.log('Player not found in any room.');
          socket.send(JSON.stringify({ action: 'error', message: 'Not in a room or host cannot submit.' }));
          return;
        }

        if (room.phase !== 'submissions') {
          socket.send(JSON.stringify({ action: 'error', message: 'Submissions are not open.' }));
          return;
        }

        if (room.submissionEndsAt && Date.now() > room.submissionEndsAt) {
          socket.send(JSON.stringify({ action: 'error', message: 'Submission time has ended.' }));
          return;
        }

        const item = sanitizeItem(data.item);
        if (!item) return;

        room.submissions.push(item);

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({
            action: 'new_submission',
            item,
          });

          room.host.send(payload);
        }
      }
      else if (data.action === 'get_submissions') {
        const room = rooms[data.roomCode];
        if (!room) {
          socket.send(JSON.stringify({ action: 'error', message: 'Room not found.' }));
          return;
        }

        socket.send(JSON.stringify({
          action: 'submissions_list',
          submissions: room.submissions,
        }));
      }
      else if (data.action === 'start_voting') {
        const room = getRoomBySocket(socket);
        if (!room || room.host !== socket) {
          console.log('Host not found in any room.');
          return;
        }

        room.phase = 'voting';
        room.submittedPlayers = new Set();
        room.voteCounts = {};

        const uniqueSubmissions = dedupeItems(room.submissions);
        room.votingItems = uniqueSubmissions;

        const payload = JSON.stringify({
          action: 'start_voting',
          submissions: uniqueSubmissions,
          votesPerPlayer: VOTES_PER_PLAYER,
        });

        getPlayerSockets(room).forEach(playerSocket => {
          if (playerSocket.readyState === WebSocket.OPEN) {
            playerSocket.send(payload);
          }
        });

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(payload);
        }

        console.log(`Sent submissions to ${room.players.length} players + host for voting.`);
      }
      else if (data.action === 'submit_votes') {
        const room = getRoomBySocket(socket);
        if (!room || socket.role !== 'player') {
          socket.send(JSON.stringify({ action: 'error', message: 'Not in a room.' }));
          return;
        }

        if (room.phase !== 'voting') {
          socket.send(JSON.stringify({ action: 'error', message: 'Voting is not open.' }));
          return;
        }

        if (room.submittedPlayers.has(socket)) {
          socket.send(JSON.stringify({ action: 'error', message: 'Votes already submitted.' }));
          return;
        }

        const votes = data.votes || {};
        let totalVotes = 0;

        for (const [item, count] of Object.entries(votes)) {
          if (!room.votingItems.includes(item)) {
            socket.send(JSON.stringify({ action: 'error', message: 'Invalid vote item.' }));
            return;
          }
          if (!Number.isInteger(count) || count < 0) {
            socket.send(JSON.stringify({ action: 'error', message: 'Invalid vote count.' }));
            return;
          }
          totalVotes += count;
        }

        if (totalVotes > VOTES_PER_PLAYER) {
          socket.send(JSON.stringify({ action: 'error', message: 'Too many votes.' }));
          return;
        }

        for (const [item, count] of Object.entries(votes)) {
          if (!room.voteCounts[item]) {
            room.voteCounts[item] = 0;
          }
          room.voteCounts[item] += count;
        }

        room.submittedPlayers.add(socket);

        if (room.players.length > 0 && room.submittedPlayers.size === room.players.length) {
          const sortedItems = Object.entries(room.voteCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([itemName]) => itemName);

          let topItems = sortedItems.slice(0, BRACKET_SIZE);
          if (topItems.length === 0) {
            return;
          }

          const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(topItems.length));
          const byesToAdd = nextPowerOfTwo - topItems.length;
          if (byesToAdd > 0) {
            topItems = [...topItems, ...Array(byesToAdd).fill('BYE')];
          }

          const bracket = [];
          let left = 0;
          let right = topItems.length - 1;

          while (left < right) {
            const item1 = topItems[left];
            const item2 = topItems[right];
            let winner = null;
            if (item2 === 'BYE' && item1 !== 'BYE') {
              winner = item1;
            } else if (item1 === 'BYE' && item2 !== 'BYE') {
              winner = item2;
            }
            bracket.push({
              seed1: left + 1,
              item1,
              seed2: right + 1,
              item2,
              winner,
            });
            left++;
            right--;
          }

          if (left === right) {
            bracket.push({
              seed1: left + 1,
              item1: topItems[left],
              seed2: null,
              item2: 'BYE',
              winner: topItems[left],
            });
          }

          room.bracket = bracket;
          room.phase = 'battle';

          const payload = JSON.stringify({
            action: 'voting_complete',
            bracket,
          });

          if (room.host.readyState === WebSocket.OPEN) {
            room.host.send(payload);
          }

          getPlayerSockets(room).forEach(playerSocket => {
            if (playerSocket.readyState === WebSocket.OPEN) {
              playerSocket.send(payload);
            }
          });

          console.log('Voting complete. Bracket sent.');
        }
      }
      else if (data.action === 'start_battle') {
        const room = getRoomBySocket(socket);
        if (!room || room.host !== socket) {
          console.log('Host not found for starting battle.');
          return;
        }

        if (room.phase !== 'battle') {
          return;
        }

        const battleKey = `${data.battle.item1}||${data.battle.item2}`;
        if (room.completedBattles.has(battleKey)) {
          return;
        }

        room.currentBattle = {
          item1: data.battle.item1,
          item2: data.battle.item2,
          votes: { [data.battle.item1]: 0, [data.battle.item2]: 0 },
          submittedPlayers: new Set(),
        };

        const payload = JSON.stringify({
          action: 'battle_start',
          battle: data.battle,
        });

        getPlayerSockets(room).forEach(playerSocket => {
          if (playerSocket.readyState === WebSocket.OPEN) {
            playerSocket.send(payload);
          }
        });

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(payload);
        }
      }
      else if (data.action === 'submit_battle_vote') {
        const room = getRoomBySocket(socket);
        if (!room || socket.role !== 'player') {
          return;
        }

        if (room.phase !== 'battle' || !room.currentBattle) {
          return;
        }

        const voteFor = data.vote;
        if (!room.currentBattle.votes.hasOwnProperty(voteFor)) {
          return;
        }

        if (room.currentBattle.submittedPlayers.has(socket)) {
          return;
        }

        room.currentBattle.votes[voteFor]++;
        room.currentBattle.submittedPlayers.add(socket);

        if (room.players.length > 0 && room.currentBattle.submittedPlayers.size === room.players.length) {
          const votes = room.currentBattle.votes;
          const winner = votes[room.currentBattle.item1] >= votes[room.currentBattle.item2]
            ? room.currentBattle.item1
            : room.currentBattle.item2;
          room.battleWinners[`${room.currentBattle.item1}||${room.currentBattle.item2}`] = winner;

          const payload = JSON.stringify({
            action: 'battle_result',
            winner,
            battle: {
              item1: room.currentBattle.item1,
              item2: room.currentBattle.item2,
            }
          });

          if (room.host.readyState === WebSocket.OPEN) {
            room.host.send(payload);
          }

          getPlayerSockets(room).forEach(playerSocket => {
            if (playerSocket.readyState === WebSocket.OPEN) {
              playerSocket.send(payload);
            }
          });

          const completedKey = `${room.currentBattle.item1}||${room.currentBattle.item2}`;
          room.completedBattles.add(completedKey);
          delete room.currentBattle;
        }
      }
      else if (data.action === 'end_game') {
        const room = getRoomBySocket(socket);
        if (!room || room.host !== socket) {
          return;
        }

        const payload = JSON.stringify({ action: 'game_over' });
        getPlayerSockets(room).forEach(playerSocket => {
          if (playerSocket.readyState === WebSocket.OPEN) {
            playerSocket.send(payload);
          }
          playerSocket.close();
        });

        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(payload);
          room.host.close();
        }

        delete rooms[socket.roomCode];
      }

    } catch (err) {
      console.error('Invalid message', err);
    }
  });

  socket.on('close', () => {
    console.log('Client disconnected ❌');

    const room = getRoomBySocket(socket);
    if (!room) return;

    if (socket.role === 'host') {
      room.host = null;
      return;
    }

    room.players = room.players.filter(player => player.socket !== socket);

    if (room.host && room.host.readyState === WebSocket.OPEN) {
      room.host.send(JSON.stringify({
        action: 'player_count',
        count: room.players.length,
      }));
      room.host.send(JSON.stringify({
        action: 'player_list',
        players: getPlayerNames(room),
      }));
    }

    if (!room.host && room.players.length === 0) {
      delete rooms[socket.roomCode];
    }
  });
});

console.log('WebSocket server running on ws://localhost:8080');

server.listen(PORT, () => {
  console.log(`case_closed listening on ${PORT} (http + ws:/ws)`);
});
