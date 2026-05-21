const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 10000;
const GLOBAL_ROOM = 'the-matrix';
let currentHostId = null;

io.on('connection', (socket) => {
    console.log(`[CONNECT] Device linked: ${socket.id}`);

    // Time sync responder
    socket.on('sync-ping', (callback) => {
        callback(Date.now()); 
    });

    // Auto-Routing Entry System
    socket.on('request-entry', (callback) => {
        const room = io.sockets.adapter.rooms.get(GLOBAL_ROOM);
        
        // If there is no host, or the host ghosted the connection, crown this user.
        if (!currentHostId || !room || !room.has(currentHostId)) {
            currentHostId = socket.id;
            socket.join(GLOBAL_ROOM);
            socket.isHost = true;
            console.log(`[HOST] ${socket.id} assumed direct control.`);
            callback({ role: 'host' });
        } else {
            // Host exists. Subjugate this user as a peer.
            socket.join(GLOBAL_ROOM);
            socket.isHost = false;
            console.log(`[PEER] Node ${socket.id} bound to matrix.`);
            
            // Instantly notify the Dictator to hot-sync the new arrival
            socket.to(currentHostId).emit('peer-joined');
            
            callback({ role: 'peer' });
        }
    });

    // Relay commands from Dictator -> Slaves
    socket.on('sync-command', (data) => {
        if (socket.isHost) {
            socket.to(GLOBAL_ROOM).emit('sync-execute', data);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] ${socket.id} dropped.`);
        if (socket.id === currentHostId) {
            currentHostId = null;
            socket.to(GLOBAL_ROOM).emit('host-disconnected');
            console.log(`[SYSTEM] Dictator lost. Matrix reset.`);
        } else {
            const room = io.sockets.adapter.rooms.get(GLOBAL_ROOM);
            const size = room ? room.size - 1 : 0; // Exclude host from count
            if (currentHostId) {
                socket.to(currentHostId).emit('peer-left', size);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`[SYSTEM] Matrix Relay Server active on port ${PORT}`);
});