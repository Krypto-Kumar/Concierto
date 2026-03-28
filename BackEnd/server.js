const { Server } = require('socket.io');
const { exec, spawn } = require('child_process');
const http = require('http');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/audio', express.static('downloads'));

const rooms = {};
const serverState = {};

// Utility

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

    const cmd = `yt-dlp "ytsearch5:${query}" --dump-json --flat-playlist --no-download`;

    exec(cmd, (error, stdout, stderr) =>
    {
        if (error)
        {
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

// POST /queue/add  (body: { roomId, url, title, id })
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
        console.log("Room ID: ", roomId);
        console.log("Song Add Request Denied (Already In Queue): ", title);
        console.log("----------------------------------------------\n");

        return res.status(400).json({ error: 'Already in Queue' });
    }

    const outputPath = `downloads/${id}.mp3`;
    const cmd = `yt-dlp -t mp3 -o "${outputPath}" "${url}"`;

    const fileExists = fs.existsSync(outputPath);

    if (fileExists)
    {
        const track = { id, title, src: `http://localhost:3001/audio/${id}.mp3`, thumbnail: `https://img.youtube.com/vi/${id}/0.jpg` };
        rooms[roomId].queue.push(track);
        io.to(roomId).emit('track-ready', { queue: rooms[roomId].queue });
        return res.json({ id, title, status: 'added' });
    }

    res.json({ id, title, status: 'downloading' });

    const download = spawn('yt-dlp', [
        '-x', '--audio-format', 'mp3',
        '-o', outputPath,
        url
    ]);

    download.stdout.on('data', (data) =>
    {
        const match = data.toString().match(/(\d+\.?\d*)%/);
        if (match)
        {
            const percent = parseFloat(match[1]);
            io.to(roomId).emit('download-progress', { id, title, percent }); // ✅
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
            id,
            title,
            src: `http://localhost:3001/audio/${id}.mp3`,
            thumbnail: `https://img.youtube.com/vi/${id}/0.jpg`
        };

        if (rooms[roomId])
        {
            rooms[roomId].queue.push(track);
            io.to(roomId).emit('track-ready', { queue: rooms[roomId].queue });
        }
    });

});

exec(cmd, (error) =>
{
    if (error)
    {
        console.error(`Download failed for ${title}:`, error);
        io.to(roomId).emit('download-failed', { id, title });
        return;
    }
    console.log(`Download complete: ${title}`);



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
                room.queue.shift();
            }

            room.currentTime = 0;
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
    });

});

server.listen(3001, () => console.log('Server Running on Port: 3001'));
