const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Room state
const rooms = new Map();
// roomId -> { users: [socketId, socketId], holding: Set<socketId>, connected: bool }

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

function findWaitingRoom() {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.length === 1 && !room.connected) {
      return roomId;
    }
  }
  return null;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;

    // User enters — find or create a room
    socket.on('enter', () => {
      const waitingRoomId = findWaitingRoom();

      if (waitingRoomId) {
        // Join existing waiting room
        currentRoom = waitingRoomId;
        const room = rooms.get(waitingRoomId);
        room.users.push(socket.id);
        socket.join(waitingRoomId);

        // Notify both users that a partner has arrived
        io.to(waitingRoomId).emit('partner-arrived');
        console.log(`Room ${waitingRoomId}: two users present`);
      } else {
        // Create new room, wait alone
        currentRoom = generateRoomId();
        rooms.set(currentRoom, {
          users: [socket.id],
          holding: new Set(),
          connected: false,
          destroyed: false
        });
        socket.join(currentRoom);
        socket.emit('waiting-alone', { roomId: currentRoom });
        console.log(`Room ${currentRoom}: created, waiting`);
      }
    });

    // User presses and holds the button
    socket.on('hold-start', () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room || room.destroyed) return;

      room.holding.add(socket.id);

      // Notify partner that this user is holding
      socket.to(currentRoom).emit('partner-holding', true);

      // If both users are holding, open the portal
      if (room.holding.size === 2 && !room.connected) {
        room.connected = true;
        io.to(currentRoom).emit('portal-open');
        console.log(`Room ${currentRoom}: portal opened`);
      }
    });

    // User releases the button
    socket.on('hold-end', () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room || room.destroyed) return;

      room.holding.delete(socket.id);

      // Notify partner
      socket.to(currentRoom).emit('partner-holding', false);

      // If portal was open, destroy the room
      if (room.connected) {
        room.destroyed = true;
        io.to(currentRoom).emit('portal-closed');
        rooms.delete(currentRoom);
        console.log(`Room ${currentRoom}: destroyed`);
      }
    });

    // WebRTC signaling
    socket.on('rtc-offer', ({ offer }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('rtc-offer', { offer });
    });

    socket.on('rtc-answer', ({ answer }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('rtc-answer', { answer });
    });

    socket.on('rtc-ice', ({ candidate }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('rtc-ice', { candidate });
    });

    // User disconnects
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (!currentRoom) return;

      const room = rooms.get(currentRoom);
      if (!room) return;

      // Notify partner and destroy room
      socket.to(currentRoom).emit('portal-closed');
      rooms.delete(currentRoom);
      console.log(`Room ${currentRoom}: destroyed on disconnect`);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`> Portail ready on http://localhost:${PORT}`);
  });
});
