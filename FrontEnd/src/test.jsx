import {io} from "socket.io-client";
import {useRef, useState, useEffect} from "react";

const socket = io("http://localhost:3001");

function App() {
	const [songQueue, setQueue] = useState([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [roomId, setRoomId] = useState(null);

	// Set up ALL socket listeners once on mount — never re-registers
	useEffect(() => {
		socket.on("room-state", (state) => {
			console.log("room-state received:", state);
			setQueue(state.queue);
			setCurrentIndex(state.currentIndex);
		});

		socket.on("track-ready", ({queue}) => {
			console.log("track-ready received, queue:", queue);
			setQueue(queue);
		});

		socket.on("download-failed", ({title}) => {
			console.error(`Download failed: ${title}`);
		});

		return () => {
			socket.off("room-state");
			socket.off("track-ready");
			socket.off("download-failed");
		};
	}, []);

	// handleJoin now ONLY emits the event and sets roomId
	function handleJoin(enteredRoomId) {
		socket.emit("join-room", enteredRoomId);
		setRoomId(enteredRoomId);
	}

	function addToQueue(song) {
		fetch("http://localhost:3001/queue/add", {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({
				roomId: roomId,
				id: song.id,
				title: song.title,
				url: song.url,
			}),
		});
	}

	if (!roomId) {
		return <JoinRoom onJoin={handleJoin} />;
	}

	return (
		<div>
			<p>Room: {roomId}</p>
			<Audio
				queue={songQueue}
				currentIndex={currentIndex}
				socket={socket}
				roomId={roomId}
			/>
			<Search onAdd={addToQueue} />
		</div>
	);
}

function JoinRoom({onJoin}) {
	const [input, setInput] = useState("");

	function handleSubmit() {
		if (!input.trim()) return;
		onJoin(input.trim());
	}

	return (
		<div>
			<h2>Join a Room</h2>
			<input
				type="text"
				placeholder="Enter room name"
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
				}}
			/>
			<button onClick={handleSubmit}>Join</button>
		</div>
	);
}

function Audio({queue, currentIndex, socket, roomId}) {
	const audioRef = useRef(null);

	const [seekbar, setSeekbar] = useState(0);
	const [trackName, setTrackName] = useState("");
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);

	useEffect(() => {
		// Someone else in the room played or paused
		socket.on("play-pause", ({playing, currentTime}) => {
			if (!audioRef.current) return;
			audioRef.current.currentTime = currentTime;
			if (playing) {
				audioRef.current.play();
			} else {
				audioRef.current.pause();
			}
		});

		// Someone else seeked
		socket.on("seek", ({currentTime}) => {
			if (!audioRef.current) return;
			audioRef.current.currentTime = currentTime;
		});

		return () => {
			socket.off("play-pause");
			socket.off("seek");
		};
	}, []);

	function handleCurrentTime() {
		if (!audioRef.current) return;

		const tempCurrentTime = audioRef.current.currentTime;
		const tempSeekbar =
			duration > 0 ? (tempCurrentTime / duration) * 100 : 0;

		setCurrentTime(tempCurrentTime);
		setSeekbar(tempSeekbar);
	}

	function handleDuration() {
		if (!audioRef.current) return;
		console.log("Track loaded, src:", audioRef.current.src);
		console.log("Duration:", audioRef.current.duration);

		audioRef.current.play();
        socket.emit("play-pause", {
			roomId,
			playing: true,
			currentTime: audioRef.current.currentTime,
		});

		const tempDuration = audioRef.current.duration;
		setDuration(tempDuration);

		setTrackName(queue[currentIndex]?.title || "");
	}

	return (
		<div>
			<audio
				src={queue[currentIndex]?.src}
				ref={audioRef}
				onTimeUpdate={handleCurrentTime}
				onLoadedMetadata={handleDuration}></audio>

			<SongInfo
				audioRef={audioRef}
				seekbar={seekbar}
				trackName={trackName}
				currentTime={currentTime}
				duration={duration}
				onSeekbarUpdate={handleCurrentTime}
				socket={socket}
				roomId={roomId}
			/>

			<SongControl
				audioRef={audioRef}
				queue={queue}
				currentIndex={currentIndex}
				socket={socket}
				roomId={roomId}
			/>

			<Volume audioRef={audioRef} />
		</div>
	);
}

function SongInfo({
	audioRef,
	seekbar,
	trackName,
	currentTime,
	duration,
	onSeekbarUpdate,
	socket,
	roomId,
}) {
	const seekbarRef = useRef(null);

	function handleSeekbarUpdate(e) {
		const value = (duration / 100) * e;
		audioRef.current.currentTime = value;
		onSeekbarUpdate();

		socket.emit("seek", {roomId, currentTime: value});
	}

	return (
		<div>
			<input
				type="range"
				id="seekbar"
				ref={seekbarRef}
				min={0}
				max={100}
				value={seekbar}
				onChange={(e) => handleSeekbarUpdate(e.target.value)}
			/>

			<p id="track">{trackName}</p>

			<p>
				<span id="current-time">{formatTime(currentTime)}</span> /{" "}
				<span id="total-time">{formatTime(duration)}</span>
			</p>
		</div>
	);
}

function SongControl({audioRef, queue, currentIndex, socket, roomId}) {
	const [isPlaying, setIsPlaying] = useState(false);

	function previous() {
		if (currentIndex <= 0) return;
		socket.emit("prev-track", {roomId});
	}

	function next() {
		if (currentIndex >= queue.length - 1) return;
		socket.emit("next-track", {roomId});
	}

	function playPause() {
		if (!audioRef.current) return;

		const wasPaused = audioRef.current.paused;

		if (wasPaused) {
			audioRef.current.play().catch((err) => {
				if (err.name !== "AbortError")
					console.error("Play error:", err);
			});
			setIsPlaying(true);
		} else {
			audioRef.current.pause();
			setIsPlaying(false);
		}

		socket.emit("play-pause", {
			roomId,
			playing: wasPaused,
			currentTime: audioRef.current.currentTime,
		});
	}

	return (
		<div>
			<button id="previous" onClick={previous}>
				Previous
			</button>
			<button id="play" onClick={playPause}>
				{isPlaying ? "Pause" : "Play"}
			</button>
			<button id="next" onClick={next}>
				Next
			</button>
		</div>
	);
}

function Search({onAdd}) {
	const [results, setResults] = useState([]);
	const inputRef = useRef(null); // ref to read input value directly

	async function handleSubmit() {
		const value = inputRef.current.value;

		if (!value) {
			setResults([]);
			return;
		}

		const response = await fetch(
			`http://localhost:3001/search?q=${encodeURIComponent(value)}`,
		);
		const data = await response.json();
		setResults(data);
	}

	return (
		<form autoComplete="off">
			<input
				type="text"
				ref={inputRef}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						handleSubmit();
					}
				}}
			/>
			<ul>
				{results.map((song) => (
					<li key={song.id}>
						<button type="button" onClick={() => onAdd(song)}>
							{song.title} ({formatTime(song.duration)})
						</button>
					</li>
				))}
			</ul>
		</form>
	);
}

function Volume({audioRef}) {
	const [volume, setVolume] = useState(100);

	function handleVolumeUpdate(e) {
		const value = e / 100;
		audioRef.current.volume = value;
		setVolume(e);
	}

	return (
		<div>
			<input
				type="range"
				id="volume"
				min={0}
				max={100}
				value={volume}
				onChange={(e) => handleVolumeUpdate(e.target.value)}
			/>
		</div>
	);
}

// Utility

// Function to format time to update the time left and total time
function formatTime(seconds) {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);

	return mins + ":" + (secs < 10 ? "0" : "") + secs;
}

export default App;