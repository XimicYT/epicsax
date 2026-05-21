const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

// THE DICTATOR'S FIREWALL OVERRIDE
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*", // This tells the server to accept connections from Netlify, Render, or anywhere else
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 10000;
const GLOBAL_ROOM = 'the-matrix';
let currentHostId = null;

io.on('connection', (socket) => {
    console.log(`[CONNECT] Device linked: ${socket.id}`);

    socket.on('sync-ping', (callback) => {
        callback(Date.now()); 
    });

    socket.on('request-entry', (callback) => {
        const room = io.sockets.adapter.rooms.get(GLOBAL_ROOM);
        
        if (!currentHostId || !room || !room.has(currentHostId)) {
            currentHostId = socket.id;
            socket.join(GLOBAL_ROOM);
            socket.isHost = true;
            console.log(`[HOST] ${socket.id} assumed direct control.`);
            callback({ role: 'host' });
        } else {
            socket.join(GLOBAL_ROOM);
            socket.isHost = false;
            console.log(`[PEER] Node ${socket.id} bound to matrix.`);
            
            socket.to(currentHostId).emit('peer-joined');
            callback({ role: 'peer' });
        }
    });

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
            const size = room ? room.size - 1 : 0; 
            if (currentHostId) {
                socket.to(currentHostId).emit('peer-left', size);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`[SYSTEM] Matrix Relay Server active on port ${PORT}`);
});