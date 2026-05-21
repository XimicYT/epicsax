const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const path = require('path'); // We need this to resolve the file path

// THE DICTATOR'S FIREWALL OVERRIDE
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 10000;
const GLOBAL_ROOM = 'the-matrix';
let currentHostId = null;

// ==========================================
// NEW: FRONT-END ROUTING
// ==========================================
// This tells Express to serve any static files (like video.mp4 if it's in the same folder)
app.use(express.static(__dirname));

// This tells Express to send index.html when someone visits the root URL (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// THE HEALTH ENDPOINT
// ==========================================
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'Matrix is awake', 
        time: Date.now() 
    });
});

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