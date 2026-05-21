const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 10000;

io.on('connection', (socket) => {
    console.log(`[CONNECT] Device linked: ${socket.id}`);

    // CRITICAL NEW ADDITION: Time sync responder
    socket.on('sync-ping', (callback) => {
        callback(Date.now()); 
    });

    socket.on('create-room', (roomCode) => {
        socket.join(roomCode);
        socket.roomId = roomCode;
        socket.isHost = true;
        console.log(`[HOST] Room [${roomCode}] created by ${socket.id}`);
    });

    socket.on('join-room', (roomCode, callback) => {
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            socket.roomId = roomCode;
            console.log(`[PEER] Node ${socket.id} joined [${roomCode}]`);
            socket.to(roomCode).emit('peer-count-update', room.size - 1);
            callback({ success: true });
        } else {
            callback({ success: false, message: "Matrix code not found." });
        }
    });

    socket.on('sync-command', (data) => {
        if (socket.roomId && socket.isHost) {
            socket.to(socket.roomId).emit('sync-execute', data);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] ${socket.id} dropped.`);
        if (socket.roomId) {
            if (socket.isHost) socket.to(socket.roomId).emit('host-disconnected');
            else {
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