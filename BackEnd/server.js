const { Server } = require('socket.io');
const { exec, spawn } = require('child_process');
const http = require('http');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/audio', express.static('downloads'));

const rooms = {};
const serverState = {};

const songsTracking = {
    //   "abc123": {
    //     filePath: "./songs/abc123.mp3",
    //     lastUsedAt: Date.now(),
    //     inUse: false
    //   }
};

const downloadsDir = path.join(__dirname, "downloads");

// Create folder if it doesn't exist
if (!fs.existsSync(downloadsDir))
{
    fs.mkdirSync(downloadsDir);
}


// Utility
setInterval(() =>
{
    const now = Date.now();
    const TTL = 20 * 60 * 1000; // 20 minutes


    Object.entries(songsTracking).forEach(([id, song]) =>
    {

        const isExpired = (now - songsTracking[id].lastUsedAt) > TTL;
        const isInUseCount = song.inUseCount;

        if (isInUseCount === 0 && isExpired)
        {
            fs.unlink(song.filePath, (err) =>
            {
                if (err)
                {
                    console.error("Error deleting:", song.filePath, err);
                } else
                {
                    console.log("Deleted:", song.filePath);
                    delete songsTracking[id];
                }
            });
        }
    });

    for (const id in rooms) 
    {
        const socketsInRoom = io.sockets.adapter.rooms.get(id);
        if (!socketsInRoom)
        {
            delete rooms[id];
            delete serverState[id];
            console.log(`Room ${id} deleted`);
        }
    }
}, 60 * 1000);


const SONGS_DIR = "./downloads";

fs.readdir(SONGS_DIR, (err, files) =>
{
    if (err) return console.error('Could not read downloads dir:', err);
    files.forEach(file =>
    {
        const id = file.split(".")[0];

        songsTracking[id] = {
            lastUsedAt: Date.now(),
            filePath: path.join(SONGS_DIR, file),
            inUseCount: 0
        };
    });
});

// Creation of Random RoodId
function generateRoomId()
{
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateHostToken()
{
    return Math.random().toString(36).substring(2, 18).toUpperCase();
}

// !-------------------------------------------------------------------------------------------------------------------------!

// Creation of Room
app.get('/create-room', (req, res) =>
{
    let roomId = generateRoomId();
    const hostToken = generateHostToken();

    while (rooms[roomId])
    {
        roomId = generateRoomId();
    }

    rooms[roomId] = {
        currentIndex: 0,
        currentTime: 0,
        queue: [],
        playing: true
    };

    serverState[roomId] = {
        hostToken: hostToken,
        hostSocketId: null,
        joinQueue: []
    }

    console.log("Room Created: ", roomId);
    console.log("----------------------------------------------\n");

    res.json({ roomId, hostToken });
});

// GET /search?q=some+song+name
app.get('/search', (req, res) =>
{
    const query = req.query.q;

    if (!query)
    {
        return res.status(400).json({ error: 'No search query provided' });
    }

    const cmd = `/usr/local/bin/yt-dlp "ytsearch5:${query}" --dump-json --flat-playlist --no-download`;

    exec(cmd, (error, stdout, stderr) =>
    {
        if (error)
        {
            console.log(error);
            return res.status(500).json({ error: 'Search failed' });
        }

        const results = stdout
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
            .map(r => ({
                id: r.id,
                title: r.title,
                duration: r.duration,
                url: r.webpage_url
            }));

        res.json(results);
    });
});


// POST /queue/add  (body: { roomId, url, title, id }
app.post('/queue/add', (req, res) =>
{
    const { roomId, url, title, id } = req.body;
    const queueFull = rooms[roomId]?.queue.length >= 8;

    if (queueFull)
    {
        return res.status(400).json({ error: 'Queue is full' });
    }

    const upcomingTracks = rooms[roomId]?.queue.slice(rooms[roomId].currentIndex);
    const alreadyInQueue = upcomingTracks.some(track => track.id === id);

    if (alreadyInQueue)
    {
        return res.status(400).json({ error: 'Already in Queue' });
    }

    const outputPath = path.join(downloadsDir, `${id}.mp3`);
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
    const fileExists = fs.existsSync(outputPath);

    if (fileExists)
    {
        const track = {
            id, title,
            src: `${BACKEND_URL}/audio/${id}.mp3`,
            thumbnail: `https://img.youtube.com/vi/${id}/0.jpg`
        };

        rooms[roomId].queue.push(track);

        if (songsTracking[track.id])
        {
            songsTracking[track.id].inUseCount += 1;
            songsTracking[track.id].lastUsedAt = Date.now();
        }
        io.to(roomId).emit('track-ready', { queue: rooms[roomId].queue });
        return res.json({ id, title, status: 'added' });
    }

    res.json({ id, title, status: 'downloading' });

    const download = spawn('/usr/local/bin/yt-dlp', [
    cleanUrl,
    '--js-runtimes', 'node',
    '--no-playlist',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    '--extractor-args', 'youtube:player_client=android',
    '-x',
    '--audio-format', 'mp3',
    '-o', outputPath
]);

    console.log("URL: ", url);
    
    download.stderr.on('data', (data) =>
    {
        console.log("YT-DLP STDERR:", data.toString());
        const match = data.toString().match(/(\d+\.?\d*)%/);
        if (match)
        {
            const percent = parseFloat(match[1]);
            io.to(roomId).emit('download-progress', { id, title, percent });
        }
    });

    download.on('close', (code) =>
    {
        if (code !== 0)
        {
            io.to(roomId).emit('download-failed', { id, title });
            console.error(`Download failed for ${title}:`, code);
            return;
        }

        const track = {
            id, title,
            src: `${BACKEND_URL}/audio/${id}.mp3`,
            thumbnail: `https://img.youtube.com/vi/${id}/0.jpg`
        };

        if (rooms[roomId])
        {
            songsTracking[track.id] = {
                filePath: outputPath,
                lastUsedAt: Date.now(),
                inUseCount: 1
            };
            rooms[roomId].queue.push(track);
            io.to(roomId).emit('track-ready', { queue: rooms[roomId].queue });
        }
    });
});
// ------------------Socket----------------------------------------------------------

io.on('connection', (socket) =>
{
    // When a user joins a room, this sends the state of the room to the user
    socket.on('join-room', (roomId) =>
    {
        socket.join(roomId);
        socket.roomId = roomId;

        if (!rooms[roomId])
        {
            rooms[roomId] = {
                currentIndex: 0,
                currentTime: 0,
                queue: [],
                playing: true
            };

            const hostToken = generateHostToken();

            serverState[roomId] = {
                hostToken: hostToken,
                hostSocketId: null,
                joinQueue: []
            };
        }

        serverState[roomId].joinQueue.push(socket.id);

        if (serverState[roomId].hostSocketId === null)
        {
            serverState[roomId].hostSocketId = serverState[roomId].joinQueue[0];
        }

        console.log('User joining room:', roomId);
        console.log('Sending state:', rooms[roomId]);
        console.log("----------------------------------------------\n");

        // Emits the roomState to the user
        socket.emit('room-state', rooms[roomId]);
    });

    socket.on('claim-host', ({ roomId, hostToken }) =>
    {
        if (!serverState[roomId])
        {
            return socket.emit('claim-host', { isHost: false });
        }

        if (serverState[roomId].hostToken === hostToken)
        {
            serverState[roomId].joinQueue = serverState[roomId].joinQueue.filter(id => id !== socket.id);
            serverState[roomId].joinQueue.unshift(socket.id);

            serverState[roomId].hostSocketId = socket.id;

            socket.emit('claim-host', { isHost: true });
        }
        else
        {
            socket.emit('claim-host', { isHost: false });
        }
    });

    // Updates the roomState when a user plays/pauses    
    socket.on('play-pause', ({ roomId, playing, currentTime }) =>
    {
        // Changes the server side playing and currentTime to the roomState
        rooms[roomId].playing = playing;
        rooms[roomId].currentTime = currentTime;

        console.log("RoomId: ", roomId);
        console.log("Server Playing: ", playing);
        console.log("----------------------------------------------\n");

        // Emit the roomState (playing, currentTime) to everyone except the sender
        socket.to(roomId).emit('play-pause', { playing, currentTime });
    });

    // Updatest the roomState when the seekbar of the song is changed by a user 
    socket.on('seek', ({ roomId, currentTime }) =>
    {
        rooms[roomId].currentTime = currentTime;

        console.log("Room ID: ", roomId);
        console.log("Server Current Time: ", currentTime);

        // Emit the roomState (currentTime) to everyone except the sender
        socket.to(roomId).emit('seek', { currentTime });
    });

    // Update the roomState when a user changes the track to next track
    socket.on('next-track', ({ roomId, currentIndex }) =>
    {
        const room = rooms[roomId];

        if (currentIndex !== room.currentIndex) return;

        if (room.currentIndex < room.queue.length - 1)
        {
            if (room.currentIndex < 2)
            {
                room.currentIndex += 1;
            }
            else
            {
                const trackId = room.queue[0].id;
                if (songsTracking[trackId])
                {
                    songsTracking[trackId].inUseCount -= 1;
                }

                room.queue.shift();
            }

            room.currentTime = 0;

            const currentTrackId = room.queue[room.currentIndex]?.id;
            if (currentTrackId && songsTracking[currentTrackId])
            {
                songsTracking[currentTrackId].lastUsedAt = Date.now();
            }

            console.log("Room ID: ", roomId);
            console.log("Next Track Selected: ", currentIndex);
            console.log("----------------------------------------------\n");

            // Emit to everyone in the server the roomState (currentIndex)
            io.to(roomId).emit('room-state', room);
        }
    });

    // Update the roomState when a user changes the track to previous track
    socket.on('prev-track', ({ roomId, currentIndex }) =>
    {
        const room = rooms[roomId];

        if (currentIndex !== room.currentIndex) return;

        if (room.currentIndex > 0)
        {
            room.currentIndex -= 1;
            room.currentTime = 0;

            const currentTrackId = room.queue[room.currentIndex]?.id;
            if (currentTrackId && songsTracking[currentTrackId])
            {
                songsTracking[currentTrackId].lastUsedAt = Date.now();
            }

            console.log("Room ID: ", roomId);
            console.log("Previous Track Selected: ", currentIndex);
            console.log("----------------------------------------------\n");

            // Emit to everyone in the server the roomState (currentIndex)
            io.to(roomId).emit('room-state', room);
        }
    });

    // Update the currentTime periodically so that the server is always in sync
    // When a new user joins, give them the currentTime of the song
    socket.on('sync-time', ({ roomId, currentTime }) =>
    {
        if (rooms[roomId])
        {
            rooms[roomId].currentTime = currentTime;
        }
    });

    socket.on('get-current-time', (roomId) =>
    {
        if (rooms[roomId])
        {
            socket.emit('current-time', { currentTime: rooms[roomId].currentTime });
        }
    });

    // Deletes a track from the queue when the host says so
    socket.on('delete-track', ({ roomId, trackId }) =>
    {
        if (socket.id !== serverState[roomId].hostSocketId) return;

        const room = rooms[roomId];
        let queue = room.queue

        const index = queue.findIndex(song => song.id === trackId);

        if (index === room.currentIndex)
        {
            socket.emit('error', { message: 'Cannot delete the currently playing song' });
            return;
        }
        else if (index < room.currentIndex)
        {
            room.currentIndex--;
        }

        queue = queue.filter(track => track.id !== trackId);

        rooms[roomId].queue = queue;

        if (songsTracking[trackId])
        {
            songsTracking[trackId].inUseCount -= 1;
        }

        io.to(roomId).emit('room-state', rooms[roomId]);
    });

    // User disconnects!
    socket.on('disconnect', () =>
    {
        console.log("User disconnected: ", socket.id);
        console.log("----------------------------------------------\n");

        const roomId = socket.roomId;

        if (!roomId || !serverState[roomId]) return;

        serverState[roomId].joinQueue = serverState[roomId].joinQueue.filter(id => id !== socket.id);

        if (socket.id === serverState[roomId].hostSocketId)
        {
            serverState[roomId].hostSocketId = serverState[roomId].joinQueue[0];
            io.to(roomId).emit('new-host', { hostSocketId: serverState[roomId].joinQueue[0] });
        }


    });

});

const port = process.env.PORT || 3001;
server.listen(port, () => console.log('Server Running on Port: 3001'));
