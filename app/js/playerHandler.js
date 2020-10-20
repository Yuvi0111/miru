const controls = document.getElementsByClassName('ctrl')

for (let item of controls) {
    item.addEventListener("click", function () {
        let func = this.dataset.name;
        window[func]()
    })
}

// event listeners
volume.addEventListener("input", ()=> updateVolume());
progress.addEventListener("input", dragBar);
progress.addEventListener("mouseup", dragBarEnd);
progress.addEventListener("touchend", dragBarEnd);
progress.addEventListener("click", dragBarEnd);
progress.addEventListener("mousedown", dragBarStart);
ptoggle.addEventListener("click", btnpp);
ptoggle.addEventListener("dblclick", btnfull);
player.addEventListener("fullscreenchange", updateFullscreen)

let playerData = {
    octopusInstance: undefined
}

function resetVideo() {
    !!playerData.octopusInstance ? playerData.octopusInstance.dispose() : ""
    playerData = {
        tracks: [],
        headers: undefined,
        styles: undefined,
        subtitles: [],
        subtitleStream: undefined,
        octopusInstance: undefined,
        nowPlaying: undefined,
        selected: undefined,
        thumbnails: []
    }
    video.pause()
    video.src = "";
    video.load()
    delete video
    video.remove()
    nowPlayingDisplay.textContent = playerData.nowPlaying || ""

    dl.removeAttribute("href")
    video = document.createElement("video")
    if (settings.player7) {
        video.setAttribute("autoPictureInPicture", "")
    } else {
        video.setAttribute("disablePictureInPicture", "")
        bpip.setAttribute("disabled", "")
    }
    video.src = ""
    video.id = "video"
    video.setAttribute("preload", "none")
    video.volume = volume.value / 100
    video.style.setProperty("--sub-font", settings.subtitle1);
    video.addEventListener("playing", resetBuffer);
    video.addEventListener("canplay", resetBuffer);
    video.addEventListener("loadeddata", initThumbnail);
    video.addEventListener("loadedmetadata", updateDisplay);
    video.addEventListener("ended", autoNext);
    video.addEventListener("waiting", isBuffering);
    video.addEventListener("timeupdate", updateDisplay);
    video.addEventListener("timeupdate", updatePositionState);
    player.prepend(video)
}
// progress bar and display

function updateDisplay() {
    let progressPercent = (video.currentTime / video.duration * 100)
    let bufferPercent = video.buffered.length == 0 ? 0 : video.buffered.end(video.buffered.length - 1) / video.duration * 100
    progress.style.setProperty("--buffer", bufferPercent + "%");
    updateBar(progressPercent || progress.value / 10);
    createThumbnail(video);
}

function dragBar() {
    video.pause()
    updateBar(progress.value / 10)
    let bg = playerData.thumbnails[Math.floor(currentTime / 5)]
    thumb.src = bg || " "
}

function dragBarEnd() {
    video.currentTime = currentTime || 0
    playVideo()
}

async function dragBarStart() {
    await video.pause()
    updateBar(progress.value / 10)
}

let currentTime;
function updateBar(progressPercent) {
    if (document.location.href.endsWith("#player")) {
        currentTime = video.duration * progressPercent / 100
        progress.style.setProperty("--progress", progressPercent + "%");
        thumb.style.setProperty("--progress", progressPercent + "%");
        elapsed.innerHTML = toTS(currentTime);
        remaining.innerHTML = toTS(video.duration - currentTime);
        progress.value = progressPercent * 10
        progress.setAttribute("data-ts", toTS(currentTime))
    }
}

// dynamic thumbnails 
let canvas = document.createElement("canvas")
let context = canvas.getContext('2d')
let h

function initThumbnail() {
    if (settings.player5) {
        h = parseInt(150 / (video.videoWidth / video.videoHeight))
        canvas.width = 150;
        canvas.height = h;
        thumb.style.setProperty("--height", h + "px");
    }
}

function createThumbnail(vid) {
    if (settings.player5) {
        let index = Math.floor(vid.currentTime / 5)
        if (!playerData.thumbnails[index] && h) {
            context.fillRect(0, 0, 150, h);
            context.drawImage(vid, 0, 0, 150, h);
            playerData.thumbnails[index] = canvas.toDataURL("image/jpeg")
        }
    }
}

function finishThumbnails(file) {
    if (settings.player5) {
        let thumbVid = document.createElement("video")
        playerData.thumbnails = []
        file.getBlobURL((err, url) => {
            thumbVid.src = url
        })
        thumbVid.addEventListener('loadeddata', () => {
            loadTime();
        })

        thumbVid.addEventListener('seeked', () => {
            createThumbnail(thumbVid);
            loadTime();
        })

        function loadTime() {
            if (thumbVid.currentTime != thumbVid.duration) {
                thumbVid.currentTime = thumbVid.currentTime + 5;
            } else {
                thumbVid.remove()
            }
        }
    }
}

//file download
function downloadFile(file) {
    file.getBlobURL((err, url) => {
        dl.href = url
        dl.download = file.name
    })
}

// bufering spinner

let buffer;
function resetBuffer() {
    if (buffer) {
        clearTimeout(buffer)
        buffer = undefined
        buffering.classList.add('hidden')
    }
}

function isBuffering() {
    buffer = setTimeout(displayBuffer, 150)
}

function displayBuffer() {
    buffering.classList.remove('hidden')
    resetTimer()
}

// immerse timeout
let immerseTime;

document.onmousemove = resetTimer;
document.onkeypress = resetTimer;
function immersePlayer() {
    player.classList.add('immersed')
}

function resetTimer() {
    clearTimeout(immerseTime);
    player.classList.remove('immersed')
    immerseTime = setTimeout(immersePlayer, parseInt(settings.player2) * 1000)
}

function toTS(sec) {
    if (Number.isNaN(sec) || sec < 0) {
        return "00:00";
    }

    let hours = Math.floor(sec / 3600)
    let minutes = Math.floor((sec - (hours * 3600)) / 60)
    let seconds = Math.floor(sec - (hours * 3600) - (minutes * 60));

    if (minutes < 10) {
        minutes = `0${minutes}`;
    }

    if (seconds < 10) {
        seconds = `0${seconds}`;
    }

    if (hours > 0) {
        return `${hours}:${minutes}:${seconds}`;
    } else {
        return `${minutes}:${seconds}`;
    }
}

// play/pause button
async function playVideo() {
    try {
        await video.play();
        bpp.innerHTML = "pause";
    } catch (err) {
        bpp.innerHTML = "play_arrow";
    }
}

function btnpp() {
    if (video.paused) {
        playVideo();
    } else {
        bpp.innerHTML = "play_arrow";
        video.pause();
    }
}

function btnnext() {
    nyaaSearch(playerData.nowPlaying[0], parseInt(playerData.nowPlaying[1]) + 1)
}
function autoNext() {
    settings.player6 ? btnnext() : ""
}
// volume shit

let oldlevel;

function btnmute() {
    if (video.volume == 0) {
        updateVolume(oldlevel)
    } else {
        oldlevel = video.volume * 100
        updateVolume(0)
    }
}


function updateVolume(a) {
    let level
    if (a == null) {
        level = volume.value;
    } else {
        level = a;
        volume.value = a;
    }
    volume.style.setProperty("--volume-level", level + "%");
    bmute.innerHTML = (level == 0) ? "volume_off" : "volume_up";
    video.volume = level / 100
}
updateVolume(parseInt(settings.player1))


// PiP

async function btnpip() {
    video !== document.pictureInPictureElement ? await video.requestPictureInPicture() : await document.exitPictureInPicture();
}

//miniplayer
if (!settings.player4) {
    player.style.setProperty("--miniplayer-display", "none");
}
// theathe mode

function btntheatre() {
    halfmoon.toggleSidebar();
}

// fullscreen

function btnfull() {
    document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen();
}
function updateFullscreen() {
    document.fullscreenElement ? bfull.innerHTML = "fullscreen_exit" : bfull.innerHTML = "fullscreen"
}

//seeking and skipping

function seek(a) {
    if (a == 85 && video.currentTime < 10) {
        video.currentTime = 90
    } else if (a == 85 && (video.duration - video.currentTime) < 90) {
        video.currentTime = video.duration
    } else {
        video.currentTime += a;
    }
    updateDisplay()
}
// subtitles, generates content every single time its opened because fuck knows when the parser will find new shit

let off
function btncap() {
    let frag = document.createDocumentFragment()
    off = document.createElement("a")
    off.classList.add("dropdown-item", "pointer", "text-white")
    off.innerHTML = "OFF"
    off.onclick = () => {
        selectLang("OFF")
    }
    frag.appendChild(off)

    for (let track of video.textTracks) {
        let template = document.createElement("a")
        template.classList.add("dropdown-item", "pointer", "text-capitalize")
        template.innerHTML = track.language || (!Object.values(video.textTracks).some(track => track.language == "eng" || track.language == "en") ? "eng" : track.label)
        if (track.mode == "showing") {
            template.classList.add("text-white")
            off.classList.add("text-muted")
            off.classList.remove("text-white")
        } else {
            template.classList.add("text-muted")
        }
        template.onclick = () => {
            selectLang(track.language)
        }
        frag.appendChild(template)
    }

    subMenu.textContent = '';
    subMenu.appendChild(frag)
}
function selectLang(lang) {
    for (let track of video.textTracks) {
        if (track.language == lang) {
            track.mode = 'showing';
            displayHeader(playerData.headers[playerData.tracks.indexOf(track)])
        }
        else {
            track.mode = 'hidden';
        }
    }
    btncap()
}

// keybinds

document.onkeydown = (a) => {
    if (document.location.href.endsWith("#player")) {
        switch (a.key) {
            case " ":
                btnpp();
                break;
            case "n":
                btnnext();
                break;
            case "m":
                btnmute();
                break;
            case "p":
                btnpip();
                break;
            case "t":
                btntheatre();
                break;
            case "c":
                btncap();
                break;
            case "f":
                btnfull();
                break;
            case "s":
                seek(85);
                break;
            case "ArrowLeft":
                seek(-parseInt(settings.player3));
                break;
            case "ArrowRight":
                seek(parseInt(settings.player3));
                break;
            case "ArrowUp":
                updateVolume(parseInt(volume.value)+5)
                break;
            case "ArrowDown":
                updateVolume(parseInt(volume.value)-5)
                break;
        }
    }
}

// media session
function selPlaying(sel) {
    playerData.nowPlaying = sel
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: store[playerData.nowPlaying[0]] ? store[playerData.nowPlaying[0]].title.english || store[playerData.nowPlaying[0]].title.romaji : playerData.nowPlaying[0],
            artist: "Episode " + playerData.nowPlaying[1],
            album: "Miru",
            artwork: [
                {
                    src: store[playerData.nowPlaying[0]] ? store[playerData.nowPlaying[0]].coverImage.medium : "",
                    sizes: '128x128',
                    type: 'image/png'
                }
            ]
        });
    }
    nowPlayingDisplay.textContent = `EP ${playerData.nowPlaying[1]}`
}

function updatePositionState() {
    if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
            duration: video.duration || 0,
            playbackRate: video.playbackRate || 0,
            position: video.currentTime || 0
        });
    }
}

if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', btnpp);
    navigator.mediaSession.setActionHandler('pause', btnpp);
    navigator.mediaSession.setActionHandler('seekbackward', () => {
        seek(-parseInt(settings.player3));
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
        seek(parseInt(settings.player3));
    });
    navigator.mediaSession.setActionHandler('nexttrack', btnnext);
}

resetVideo()