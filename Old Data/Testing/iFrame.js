
const play = document.getElementById("play");



// Load the API
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";



// console.log(tag);
document.body.appendChild(tag);

let player;

window.onYouTubeIframeAPIReady = function ()
{
    console.log(YT.Player);
    player = new YT.Player("player", {
        height: "100",
        width: "100",
        videoId: "DT9fEmSL_Lw",
        events: {
            onReady: () => console.log("Ready"),
            onError: (e) => console.log("YouTube error: ", e.data)

        }
    });
}

play.addEventListener('click', function ()
{
    const state = player.getPlayerState();
    console.log(state);

    player.playVideo();

    if (state === -1 || state === YT.PlayerState.CUED)
    {
        player.playVideo();
        console.log("unstarte");
    }

    if (state === YT.PlayerState.PLAYING)
    {
        console.log("paused");
        play.textContent = "play";
        player.pauseVideo();
    }
    else if (state === YT.PlayerState.PAUSED)
    {
        console.log("Playingg");
        play.textContent = "paused";
        player.playVideo();
    }
});


// URL = "https://www.youtube.com/iframe_api"

// let api = async () =>
// {
// let result = await fetch(URL);
// let res = result.json();
// console.log(result);
// };

