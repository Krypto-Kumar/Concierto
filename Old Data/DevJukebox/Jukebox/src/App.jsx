import {useRef, useState} from "react";

const list = [
	{
		track: "Do You Know",
		artist: "Diljit Dosanjh",
		src: "Music/Do You Know.mp3",
	},
	{
		track: "Tu Hoti Toh",
		artist: "Bharat Chauhan",
		src: "Music/Tu Hoti Toh.mp3",
	},
];

function App() {
	const [songQueue, setQueue] = useState([]);
	const [currentIndex, setCurrentIndex] = useState(0);

	function addToQueue(song) {
		setQueue([...songQueue, song]);
	}

	return (
		<div>
			<Audio
				queue={songQueue}
				currentIndex={currentIndex}
				setCurrentIndex={setCurrentIndex}
			/>
			<Search onAdd={addToQueue} />
		</div>
	);
}

function Audio({queue, currentIndex, setCurrentIndex}) {
	const audioRef = useRef(null);

	const [seekbar, setSeekbar] = useState(0);
	const [trackName, setTrackName] = useState("");
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);

	function handleCurrentTime() {
		if (!audioRef.current) {
			setCurrentTime(0);
			return;
		}

		const tempCurrentTime = audioRef.current.currentTime;
		const tempSeekbar = (tempCurrentTime / duration) * 100;

		setCurrentTime(tempCurrentTime);
		setSeekbar(tempSeekbar);
	}

	function handleDuration() {
		if (!audioRef.current) {
			setDuration(0);
			return;
		}

		audioRef.current.play();

		const tempDuration = audioRef.current.duration;
		setDuration(tempDuration);

		setTrackName(queue[currentIndex]?.track || "");
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
			/>

			<SongControl
				audioRef={audioRef}
				queue={queue}
				currentIndex={currentIndex}
				setCurrentIndex={setCurrentIndex}
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
}) {
	const seekbarRef = useRef(null);

	function handleSeekbarUpdate(e) {
		const value = (duration / 100) * e;
		audioRef.current.currentTime = value;
		onSeekbarUpdate();
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

function SongControl({audioRef, queue, currentIndex, setCurrentIndex}) {
	const [isPlaying, setIsPlaying] = useState(false);

	function previous() {
		if (currentIndex <= 0) {
			console.log("Already at first song!");
		} else {
			setCurrentIndex((prev) => prev - 1);
			console.log("Song Updated: Previous");
		}
	}

	function next() {
		if (currentIndex >= queue.length - 1) {
			console.log("Songs Already Stopped");
		} else {
			setCurrentIndex((prev) => prev + 1);
			console.log("Next Song");
		}
	}

	function playPause() {
		if (!audioRef.current) {
			console.log("No Audio Playing");
		} else if (audioRef.current.paused) {
			audioRef.current.play();
			setIsPlaying(true);
		} else {
			audioRef.current.pause();
			setIsPlaying(false);
		}
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

	function handleChange(e) {
		const value = e.target.value;

		if (!value) {
			setResults([]);
			return;
		}

		const matches = findMatches(value, list);
		setResults(matches);
	}

	return (
		<form className="search-form" autoComplete="off">
			<input type="text" onChange={handleChange} />
			<ul>
				{results.map((song, index) => (
					<li key={index}>
						<button type="button" onClick={() => onAdd(song)}>
							{song.track} - {song.artist}
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
		console.log(e);
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

// Find Matches from list
function findMatches(word, list) {
	return list.filter((song) => {
		const regex = new RegExp(word, "gi");
		return song.track.match(regex) || song.artist.match(regex);
	});
}

// Function to format time to update the time left and total time
function formatTime(seconds) {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);

	return mins + ":" + (secs < 10 ? "0" : "") + secs;
}

export default App;
