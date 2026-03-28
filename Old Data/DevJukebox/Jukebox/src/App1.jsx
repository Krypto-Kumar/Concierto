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
	const audioRef = useRef(null);

	const [songIndex, setSongIndex] = useState(0);
	const [songQueue, setQueue] = useState([]);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [trackName, setTrackName] = useState("");
	const [seekbar, setSeekbar] = useState(0);

	function addToQueue(song) {
		setQueue([...songQueue, song]);
	}

	function displayTimeUpdate() {
		if (!audioRef.current) {
			return;
		}

		setDuration(audioRef.current.duration);
		setCurrentTime(audioRef.current.currentTime);

		const currTime = audioRef.current.currentTime;
		const dur = audioRef.current.duration;

		const value = (currTime / dur) * 100;
		setSeekbar(value);
	}

	function handleTrackName() {
		const name = queue[songIndex].track;
		setTrackName({name});
	}

	function handleSeekbarUpdate(e) {
		const currTime = (audioRef.current.duration / 100) * e;
		audioRef.current.currentTime = currTime;
		setCurrentTime(currTime);
	}

	return (
		<div>
			<audio
				ref={audioRef}
				onChange={handleTrackName}
				onTimeUpdate={displayTimeUpdate}
				src={source}></audio>

			<SongInfo
				audioRef={audioRef}
				currentTime={currentTime}
				duration={duration}
				trackName={trackName}
				seekbar={seekbar}
			/>
			<SongInfoAndControl
				queue={songQueue}
				index={songIndex}
				setIndex={setSongIndex}
			/>
			<Search onAdd={addToQueue} />
		</div>
	);
}

function SongInfo({audioRef, currentTime, duration, trackName, seekbar}) {
	const audioSeekbar = useRef(null);

	// const [trackName, setTrackName] = useState("");
	// const [seekbar, setSeekbar] = useState(0);
	// const [duration, setDuration] = useState(0);
	// const [currentTime, setCurrentTime] = useState(0);

	// function handleTrackName() {
	// 	const name = queue[songIndex].track;
	// 	setTrackName({name});
	// }

	// function handleSeekbarUpdate(e) {
	// 	const currTime = (audioRef.current.duration / 100) * e;
	// 	audioRef.current.currentTime = currTime;
	// 	setCurrentTime(currTime);
	// }

	// function displayTimeUpdate() {
	// 	if (!audioRef.current) {
	// 		return;
	// 	}

	// 	setDuration(audioRef.current.duration);
	// 	setCurrentTime(audioRef.current.currentTime);

	// 	const currTime = audioRef.current.currentTime;
	// 	const dur = audioRef.current.duration;

	// 	const value = (currTime / dur) * 100;
	// 	setSeekbar(value);
	// }

	return (
		<div>
			<input
				type="range"
				id="seek-bar"
				ref={audioSeekbar}
				min={0}
				max={100}
				value={seekbar}
				onChange={(e) => handleSeekbarUpdate(e.target.value)}
			/>
			<p id="track"> {trackName}</p>

			<p>
				<span id="current-time">{formatTime(currentTime)}</span> /{" "}
				<span id="total-time">{formatTime(duration)}</span>
			</p>
		</div>
	);
}

function SongInfoAndControl({queue, index, setIndex}) {
	// const audioRef = useRef(null);
	const audioSeekbar = useRef(null);

	const [source, setSource] = useState("Track Name");
	// const [trackName, setTrackName] = useState("");
	const [volume, setVolume] = useState(100);
	// const [seekbar, setSeekbar] = useState(0);
	// const [duration, setDuration] = useState(0);
	// const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);

	function previous() {
		if (index === -1) {
			console.log("Empty Queue");
		} else {
			setIndex((prev) => prev - 1);
			console.log("Song Updated: Previous");
		}
	}

	function next() {
		if (index === queue.length) {
			console.log("Songs Already Stopped");
		} else if (songIndex === queue.length - 1) // queue
		{
			setIndex((prev) => prev + 1);
			console.log("Last Song");
		} else {
			setIndex((prev) => prev + 1);
			console.log("Song Updated: Next ", {index});
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

	// function displayTimeUpdate() {
	// 	if (!audioRef.current) {
	// 		return;
	// 	}

	// 	setDuration(audioRef.current.duration);
	// 	setCurrentTime(audioRef.current.currentTime);

	// 	const currTime = audioRef.current.currentTime;
	// 	const dur = audioRef.current.duration;

	// 	const value = (currTime / dur) * 100;
	// 	setSeekbar(value);
	// }

	// function handleSeekbarUpdate(e) {
	// 	const currTime = (audioRef.current.duration / 100) * e;
	// 	audioRef.current.currentTime = currTime;
	// 	setCurrentTime(currTime);
	// }

	function handleVolumeUpdate(e) {
		const value = e / 100;
		audioRef.current.volume = value;
		setVolume(value);
	}

	// function handleTrackName() {
	// 	const name = queue[songIndex].track;
	// 	setTrackName({name});
	// }

	function handleSource() {
		const source = queue[index].src;
		setSource(source);
	}

	return (
		<div>
			{/* <input
				type="range"
				id="seek-bar"
				ref={audioSeekbar}
				min={0}
				max={100}
				value={seekbar}
				onChange={(e) => handleSeekbarUpdate(e.target.value)}
			/>
			<p id="track"> {trackName}</p>

			<p>
				<span id="current-time">{formatTime(currentTime)}</span> /{" "}
				<span id="total-time">{formatTime(duration)}</span>
			</p> */}

			<button id="previous" onClick={previous}>
				Previous
			</button>
			<button id="play" onClick={playPause}>
				{isPlaying ? "Pause" : "Play"}
			</button>
			<button id="next" onClick={next}>
				Next
			</button>
			<input
				type="range"
				id="volumeSlider"
				min="0"
				max="100"
				value={volume}
				onChange={(e) => handleVolumeUpdate(e.target.value)}></input>
			{/* <audio
				ref={audioRef}
				onChange={handleTrackName}
				onTimeUpdate={displayTimeUpdate}
				src={source}></audio> */}
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

//Utility
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
