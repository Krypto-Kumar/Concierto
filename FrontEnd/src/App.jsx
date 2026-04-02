import {io} from "socket.io-client";
import {useRef, useState, useEffect} from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	useNavigate,
	useParams,
} from "react-router-dom";

const backendServerLink = "https://hyperlustrous-unsuspectfully-denny.ngrok-free.dev";

const socket = io(`${backendServerLink}`);

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/room/:roomId" element={<RoomPage />} />
			</Routes>
		</BrowserRouter>
	);
}

function HomePage() {
	const [input, setInput] = useState("");
	const navigate = useNavigate();

	async function handleCreate() {
		const response = await fetch(`${backendServerLink}/create-room`);
		const {roomId, hostToken} = await response.json();
		localStorage.setItem("hostToken", hostToken);
		navigate(`/room/${roomId}`);
	}

	function handleJoin() {
		if (!input.trim()) return;
		navigate(`/room/${input.trim()}`);
	}

	return (
		<div>
			<h2>Create a Room</h2>
			<button onClick={handleCreate}>Create Room</button>

			<h2>Join a Room</h2>
			<input
				type="text"
				placeholder="Enter room ID"
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleJoin();
				}}
			/>
			<button onClick={handleJoin}>Join</button>
		</div>
	);
}

function RoomPage() {
	const {roomId} = useParams();
	const [roomState, setRoomState] = useState({
		queue: [],
		currentIndex: 0,
		currentTime: 0,
		playing: true,
	});
	const [isReady, setIsReady] = useState(false);
	const [isHost, setIsHost] = useState(false);
	const [toasts, setToasts] = useState([]);
	const [downloads, setDownloads] = useState([]);

	const joinTimeRef = useRef(0);

	useEffect(() => {
		socket.emit("join-room", roomId);

		socket.emit("claim-host", {
			roomId,
			hostToken: localStorage.getItem("hostToken"),
		});
		socket.on("claim-host", ({isHost}) => {
			setIsHost(isHost);
			if (isHost) {
				setIsReady(true);
			}
		});

		socket.on("new-host", ({hostSocketId}) => {
			if (hostSocketId === socket.id) {
				setIsHost(true);
			} else {
				setIsHost(false);
			}
		});

		socket.on("room-state", (state) => {
			joinTimeRef.current = state.currentTime;
			setRoomState(state);
		});

		socket.on("track-ready", ({queue}) => {
			setRoomState((prev) => ({...prev, queue}));
			setDownloads((prev) =>
				prev.filter((d) => d.id !== queue[queue.length - 1].id),
			);
		});

		socket.on("download-failed", ({title}) => {
			console.error(`Download failed: ${title}`);
		});

		socket.on("error", ({message}) => {
			addToast(message);
		});

		socket.on("download-progress", ({id, title, percent}) => {
			setDownloads((prev) => {
				const exists = prev.some((d) => d.id === id);
				if (exists) {
					return prev.map((d) => (d.id === id ? {...d, percent} : d));
				} else {
					return [...prev, {id, title, percent}];
				}
			});
		});

		return () => {
			socket.off("room-state");
			socket.off("claim-host");
			socket.off("track-ready");
			socket.off("download-failed");
			socket.off("new-host");
			socket.off("error");
			socket.off("download-progress");
		};
	}, []);

	function addToast(message) {
		const id = Date.now();

		setToasts((prev) => [...prev, {id, message}]);

		setTimeout(() => {
			setToasts((prev) => prev.filter((toast) => toast.id !== id));
		}, 3000);
	}

	if (!isReady) {
		return (
			<div>
				<h2>Room: {roomId}</h2>
				<button
					onClick={() => {
						socket.emit("get-current-time", roomId);
						socket.once("current-time", ({currentTime}) => {
							joinTimeRef.current = currentTime;
							setIsReady(true);
						});
					}}>
					Click to Join
				</button>
			</div>
		);
	}

	return (
		<div>
			<p>Room: {roomId}</p>

			<Audio
				roomState={roomState}
				setRoomState={setRoomState}
				socket={socket}
				roomId={roomId}
				joinTimeRef={joinTimeRef}
				isHost={isHost}
			/>

			<Search roomId={roomId} addToast={addToast} />

			<DisplayQueue
				roomState={roomState}
				socket={socket}
				roomId={roomId}
				isHost={isHost}
				downloads={downloads}
			/>

			<Toast toasts={toasts} />
		</div>
	);
}

function Audio({roomState, setRoomState, socket, roomId, joinTimeRef, isHost}) {
	const audioRef = useRef(null);
	const lastSyncRef = useRef(0);

	const [seekbar, setSeekbar] = useState(0);
	const [trackName, setTrackName] = useState("");
	const [duration, setDuration] = useState(0);

	useEffect(() => {
		socket.on("play-pause", ({playing, currentTime}) => {
			if (!audioRef.current) return;
			audioRef.current.currentTime = currentTime;
			if (playing) {
				audioRef.current.play().catch((err) => {
					if (err.name !== "AbortError")
						console.error("Play error:", err);
				});
				setRoomState((prev) => ({...prev, playing: true}));
			} else {
				audioRef.current.pause();
				setRoomState((prev) => ({...prev, playing: false}));
			}
		});

		socket.on("seek", ({currentTime}) => {
			if (!audioRef.current) return;
			audioRef.current.currentTime = currentTime;

			setRoomState((prev) => ({...prev, currentTime: currentTime}));
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

		if (isHost) {
			if (tempCurrentTime - lastSyncRef.current >= 2) {
				lastSyncRef.current = tempCurrentTime;
				socket.emit("sync-time", {
					roomId,
					currentTime: tempCurrentTime,
				});
			}
		}

		setSeekbar(tempSeekbar);
		setRoomState((prev) => ({...prev, currentTime: tempCurrentTime}));
	}

	function handleDuration() {
		if (!audioRef.current) return;

		const tempDuration = audioRef.current.duration;
		setDuration(tempDuration);
		setTrackName(roomState.queue[roomState.currentIndex]?.title || "");

		audioRef.current.currentTime = joinTimeRef.current;

		if (roomState.queue.length < 1) return;

		if (roomState.playing) {
			audioRef.current
				.play()
				.then(() => {
					setRoomState((prev) => ({...prev, playing: true}));
					if (isHost) {
						socket.emit("play-pause", {
							roomId,
							playing: true,
							currentTime: audioRef.current.currentTime,
						});
					}
				})
				.catch((err) => {
					if (err.name !== "AbortError")
						console.error("Play error:", err);
					setRoomState((prev) => ({...prev, playing: false}));
				});
		}
	}

	function handleSongEnded() {
		if (roomState.currentIndex >= roomState.queue.length - 1) return;
		socket.emit("next-track", {
			roomId,
			currentIndex: roomState.currentIndex,
		});
	}

	return (
		<div>
			<audio
				src={roomState.queue[roomState.currentIndex]?.src}
				ref={audioRef}
				onTimeUpdate={handleCurrentTime}
				onLoadedMetadata={handleDuration}
				onEnded={handleSongEnded}
			/>

			<SongInfo
				audioRef={audioRef}
				seekbar={seekbar}
				trackName={trackName}
				roomState={roomState}
				duration={duration}
				onSeekbarUpdate={handleCurrentTime}
				socket={socket}
				roomId={roomId}
			/>

			<SongControl
				audioRef={audioRef}
				roomState={roomState}
				setRoomState={setRoomState}
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
	roomState,
	duration,
	onSeekbarUpdate,
	socket,
	roomId,
}) {
	function handleSeekbarUpdate(e) {
		const value = (duration / 100) * e;
		audioRef.current.currentTime = value;
		onSeekbarUpdate();
		socket.emit("seek", {roomId, currentTime: value});
	}

	// Implement later, let the user choose if he wants to see the thumbnail or not
	// const imgSrc = roomState.queue[roomState.currentIndex]?.thumbnail;

	return (
		<div>
			<input
				type="range"
				min={0}
				max={100}
				value={seekbar}
				onChange={(e) => handleSeekbarUpdate(e.target.value)}
			/>

			{/* <img src={imgSrc} alt="" /> */}

			<p>{trackName}</p>

			<p>
				<span>{formatTime(roomState.currentTime)}</span> /{" "}
				<span>{formatTime(duration)}</span>
			</p>
		</div>
	);
}

function SongControl({audioRef, roomState, setRoomState, socket, roomId}) {
	function previous() {
		if (roomState.currentIndex <= 0) return;
		socket.emit("prev-track", {
			roomId,
			currentIndex: roomState.currentIndex,
		});
	}

	function next() {
		if (roomState.currentIndex >= roomState.queue.length - 1) return;
		socket.emit("next-track", {
			roomId,
			currentIndex: roomState.currentIndex,
		});
	}

	function playPause() {
		if (!audioRef.current) return;

		const wasPaused = audioRef.current.paused;

		if (wasPaused) {
			audioRef.current.play().catch((err) => {
				if (err.name !== "AbortError")
					console.error("Play error:", err);
			});
			setRoomState((prev) => ({...prev, playing: true}));
		} else {
			audioRef.current.pause();
			setRoomState((prev) => ({...prev, playing: false}));
		}

		socket.emit("play-pause", {
			roomId,
			playing: wasPaused,
			currentTime: audioRef.current.currentTime,
		});
	}

	return (
		<div>
			<button onClick={previous}>Previous</button>
			<button onClick={playPause}>
				{roomState.playing ? "Pause" : "Play"}
			</button>
			<button onClick={next}>Next</button>
		</div>
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
				min={0}
				max={100}
				value={volume}
				onChange={(e) => handleVolumeUpdate(e.target.value)}
			/>
		</div>
	);
}

function Search({roomId, addToast}) {
	const [results, setResults] = useState([]);
	const inputRef = useRef(null);

	async function handleSubmit() {
		const value = inputRef.current.value;

		if (!value) {
			setResults([]);
			return;
		}

		const response = await fetch(
			`${backendServerLink}/search?q=${encodeURIComponent(value)}`,
		);
		const data = await response.json();
		console.log(data);
		setResults(data);
	}

	function addToQueue(song) {
		fetch(`${backendServerLink}/queue/add`, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({
				roomId: roomId,
				id: song.id,
				title: song.title,
				url: song.url,
			}),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.error) {
					addToast(data.error);
				}
			});
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
						<button type="button" onClick={() => addToQueue(song)}>
							{song.title} ({formatTime(song.duration)})
						</button>
					</li>
				))}
			</ul>
		</form>
	);
}

function DisplayQueue({roomState, socket, roomId, isHost, downloads}) {
	function deleteSong(songId) {
		socket.emit("delete-track", {roomId, trackId: songId});
	}

	return (
		<div>
			<ul>
				{roomState.queue.map((song) => (
					<li key={song.id}>
						{song.title}{" "}
						{isHost && (
							<button onClick={() => deleteSong(song.id)}>
								X
							</button>
						)}
					</li>
				))}
			</ul>

			<ul>
				{downloads.map((song) => (
					<li key={song.id}>
						{song.title}
						{"   "}
						<progress value={song.percent} max={100} />
						{song.percent}
					</li>
				))}
			</ul>
		</div>
	);
}

function Toast({toasts}) {
	return (
		<div>
			{toasts.map((toast) => (
				<div key={toast.id}>{toast.message}</div>
			))}
		</div>
	);
}

function formatTime(seconds) {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return mins + ":" + (secs < 10 ? "0" : "") + secs;
}

export default App;
