const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const rooms = new Map();
const MAX_ROOMS = 500;

// Persistent counter stored in memory (resets on server restart)
// For persistence across restarts, use a file or DB — but memory is fine for now
let totalConnections = 0;

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function findWaitingRoom() {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.length === 1 && !room.connected && !room.destroyed) {
      return roomId;
    }
  }
  return null;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Expose total connections count via API
    const parsedUrl = parse(req.url, true);
    if (parsedUrl.pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalConnections }));
      return;
    }

    if (parsedUrl.pathname === '/api/turn') {
      const username = process.env.TURN_USERNAME || '';
      const credential = process.env.TURN_CREDENTIAL || '';
      const turnUrl = process.env.TURN_URL || 'turn:global.turn.metered.ca:80';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: turnUrl, username, credential },
          { urls: turnUrl.replace(':80', ':443'), username, credential },
          { urls: turnUrl.replace('turn:', 'turns:').replace(':80', ':443'), username, credential },
        ]
      }));
      return;
    }
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('enter', () => {
      // Check capacity
      if (rooms.size >= MAX_ROOMS) {
        socket.emit('room-full');
        return;
      }

      // Always join an existing waiting room if one exists — prevents
      // two solo rooms from existing simultaneously
      const waitingRoomId = findWaitingRoom();

      if (waitingRoomId) {
        currentRoom = waitingRoomId;
        const room = rooms.get(waitingRoomId);
        room.users.push(socket.id);
        socket.join(waitingRoomId);
        io.to(waitingRoomId).emit('partner-arrived');
        console.log(`Room ${waitingRoomId}: two users present`);
      } else {
        currentRoom = generateRoomId();
        rooms.set(currentRoom, {
          users: [socket.id],
          holding: new Set(),
          connected: false,
          destroyed: false,
          openedAt: null,
        });
        socket.join(currentRoom);
        socket.emit('waiting-alone', { roomId: currentRoom });
        console.log(`Room ${currentRoom}: created, waiting`);
      }
    });

    socket.on('hold-start', () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room || room.destroyed) return;

      room.holding.add(socket.id);
      socket.to(currentRoom).emit('partner-holding', true);

      if (room.holding.size === 2 && !room.connected) {
        room.connected = true;
        room.openedAt = Date.now();
        totalConnections++;
        io.to(currentRoom).emit('portal-open');
        io.to(currentRoom).emit('stats-update', { totalConnections });
        console.log(`Room ${currentRoom}: portal opened (total: ${totalConnections})`);
      }
    });

    socket.on('hold-end', () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room || room.destroyed) return;

      room.holding.delete(socket.id);
      socket.to(currentRoom).emit('partner-holding', false);

      if (room.connected) {
        const duration = room.openedAt ? Math.floor((Date.now() - room.openedAt) / 1000) : 0;
        room.destroyed = true;
        io.to(currentRoom).emit('portal-closed', { duration });
        rooms.delete(currentRoom);
        console.log(`Room ${currentRoom}: destroyed after ${duration}s (hold-end, ICE was ${room.iceState || 'unknown'})`);
      } else {
        console.log(`Room ${currentRoom}: hold-end while not connected, holding size: ${room.holding.size}`);
      }
    });

    // WebRTC signaling
    socket.on('rtc-offer', ({ offer }) => { if (currentRoom) socket.to(currentRoom).emit('rtc-offer', { offer }); });
    socket.on('rtc-answer', ({ answer }) => { if (currentRoom) socket.to(currentRoom).emit('rtc-answer', { answer }); });
    socket.on('rtc-ice', ({ candidate }) => { if (currentRoom) socket.to(currentRoom).emit('rtc-ice', { candidate }); });

    socket.on('disconnect', (reason) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const duration = room.openedAt ? Math.floor((Date.now() - room.openedAt) / 1000) : 0;
      socket.to(currentRoom).emit('portal-closed', { duration });
      rooms.delete(currentRoom);
      console.log(`Room ${currentRoom}: destroyed on disconnect, reason: ${reason}, connected: ${room.connected}`);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`> Interstice ready on http://localhost:${PORT}`);
  });
});
