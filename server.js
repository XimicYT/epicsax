const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable CORS so your Netlify site isn't blocked by the browser
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 10000;

io.on('connection', (socket) => {
    console.log(`[CONNECT] Device linked: ${socket.id}`);

    // Host initializes a session
    socket.on('create-room', (roomCode) => {
        socket.join(roomCode);
        socket.roomId = roomCode;
        socket.isHost = true;
        console.log(`[HOST] Room [${roomCode}] created by ${socket.id}`);
    });

    // Peer attempts to join
    socket.on('join-room', (roomCode, callback) => {
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            socket.roomId = roomCode;
            console.log(`[PEER] Node ${socket.id} joined [${roomCode}]`);
            
            // Notify the host (room size minus 1 for the host themselves)
            socket.to(roomCode).emit('peer-count-update', room.size - 1);
            callback({ success: true });
        } else {
            callback({ success: false, message: "Matrix code not found or host disconnected." });
        }
    });

    // Relay playback commands from Host -> Peers
    socket.on('sync-command', (data) => {
        if (socket.roomId && socket.isHost) {
            socket.to(socket.roomId).emit('sync-execute', data);
        }
    });

    // Handle drops
    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] ${socket.id} dropped.`);
        if (socket.roomId) {
            if (socket.isHost) {
                // If host leaves, kill the room for peers
                socket.to(socket.roomId).emit('host-disconnected');
            } else {
                // If a peer leaves, update the host's count
                const room = io.sockets.adapter.rooms.get(socket.roomId);
                const size = room ? room.size - 1 : 0;
                socket.to(socket.roomId).emit('peer-count-update', size);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`[SYSTEM] Matrix Relay Server active on port ${PORT}`);
});