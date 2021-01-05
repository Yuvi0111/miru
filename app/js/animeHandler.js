const torrentRx = /(magnet:){1}|(^[A-F\d]{8,40}$){1}|(.*\.torrent){1}/i,
    imageRx = /\.(jpeg|jpg|gif|png|webp)/
window.addEventListener("paste", async e => { //WAIT image lookup on paste, or add torrent on paste
    let item = e.clipboardData.items[0];
    if (item && item.type.indexOf("image") === 0) {
        e.preventDefault();
        let reader = new FileReader();
        reader.onload = e => {
            traceAnime(e.target.result, "uri")
        };
        reader.readAsDataURL(item.getAsFile());
    } else if (item && item.type === "text/plain") {
        item.getAsString(text => {
            if (torrentRx.exec(text)) {
                e.preventDefault();
                search.value = ""
                addTorrent(text, {});
            } else if (imageRx.exec(text)) {
                e.preventDefault();
                search.value = ""
                traceAnime(text)
            }
        })
    } else if (item && item.type === "text/html") {
        item.getAsString(text => {
            let img = new DOMParser().parseFromString(text, "text/html").querySelectorAll("img")[0]
            if (img) {
                e.preventDefault();
                search.value = ""
                traceAnime(img.src)
            }
        })
    }

})
function traceAnime(image, type) { //WAIT lookup logic
    halfmoon.initStickyAlert({
        content: `Looking Up Anime ${type == "uri" ? "" : `For <span class="text-break">${image}</span>`}`
    })
    let options,
        url = `https://trace.moe/api/search?url=${image}`
    if (type == "uri") {
        options = {
            method: "POST",
            body: JSON.stringify({ image: image }),
            headers: { "Content-Type": "application/json" },
        },
            url = "https://trace.moe/api/search"
    }
    fetch(url, options).then((res) => res.json())
        .then(async (result) => {
            if (result.docs[0].similarity >= 0.85) {
                let res = await alRequest({ method: "SearchIDSingle", id: result.docs[0].anilist_id })
                viewAnime(res.data.Media)
            }
        });
}
function searchBox() { // make searchbox behave nicely
    search.placeholder = search.value
    searchAnime(search.value)
    search.value = ""
    document.location.hash = "#browse"
}
//events
navNowPlaying.onclick = () => { viewAnime(playerData.nowPlaying[0]) }
//AL lookup logic
async function alRequest(opts) {
    let query,
        variables = {
            type: "ANIME",
            sort: "TRENDING_DESC",
            page: opts.page || 1,
            perPage: opts.perPage || 30,
            status_in: opts.status_in || "[CURRENT,PLANNING]",
            chunk: opts.chunk || 1,
            perchunk: opts.perChunk || 30
        },
        options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        },
        queryObjects = `
id
title {
    romaji
    english
    native
    userPreferred
}
description(
    asHtml: true
)
season
seasonYear
format
status
episodes
duration
averageScore
genres
coverImage {
    extraLarge
    medium
    color
}
bannerImage
synonyms
nextAiringEpisode {
    timeUntilAiring
    episode
}
trailer {
    id
    site
}
streamingEpisodes {
    title
    thumbnail
}
relations {
    edges {
        relationType(version:2)
        node {
            id
            title {
                userPreferred
            }
            coverImage {
                medium
            }
            type
            status
        }
    }
}`
    if (opts.status) variables.status = opts.status
    if (localStorage.getItem("ALtoken")) options.headers['Authorization'] = localStorage.getItem("ALtoken")
    if (opts.method == "Trending") {
        search.placeholder = "Search"
        query = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $type: MediaType) {
    Page (page: $page, perPage: $perPage) {
        media(type: $type, sort: $sort) {
            ${queryObjects}
        }
    }
}`
    } else if (opts.method == "SearchName") {
        variables.search = opts.name
        query = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $type: MediaType, $search: String, $status: MediaStatus) {
    Page (page: $page, perPage: $perPage) {
        media(type: $type, search: $search, sort: $sort, status: $status) {
            ${queryObjects}
        }
    }
}`
    } else if (opts.method == "SearchIDSingle") {
        variables.id = opts.id
        query = `
query ($id: Int, $type: MediaType) { 
    Media (id: $id, type: $type){
        ${queryObjects}
    }
}`
    } else if (opts.method == "Viewer") {
        query = `
query {
    Viewer {
        avatar {
            medium
        },
        name,
        id
    }
}`
    } else if (opts.method == "UserLists") {
        variables.id = opts.id
        query = `
query ($page: Int, $perPage: Int, $id: Int, $type: MediaType, $status_in: [MediaListStatus]){
    Page (page: $page, perPage: $perPage) {
        mediaList (userId: $id, type: $type, status_in: $status_in) {
            media {
                ${queryObjects}
            }
        }
    }
}`
    } else if (opts.method == "SearchIDStatus") {
        variables.id = alID
        variables.mediaId = opts.id
        query = `
query ($id: Int, $mediaId: Int){
    MediaList(userId: $id, mediaId: $mediaId) {
        status
        progress
        repeat
    }
}`
    } else if (opts.method == "Genre") {
        variables.genre = opts.genre
        query = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $type: MediaType, $genre: String) {
    Page (page: $page, perPage: $perPage) {
        media(type: $type, sort: $sort, genre: $genre) {
            ${queryObjects}
        }
    }
}`
    }
    options.body = JSON.stringify({
        query: query,
        variables: variables
    })

    let res = await fetch('https://graphql.anilist.co', options).catch((error) => console.error(error)),
        json = await res.json();
    return json
}
async function alEntry() {
    if (playerData.nowPlaying && playerData.nowPlaying[0] && localStorage.getItem("ALtoken")) {
        let res = await alRequest({ method: "SearchIDStatus", id: playerData.nowPlaying[0].id })
        if ((res.errors && res.errors[0].status === 404) || res.data.MediaList.progress <= parseInt(playerData.nowPlaying[1])) {
            let query = `
mutation ($id: Int, $status: MediaListStatus, $episode: Int, $repeat: Int) {
    SaveMediaListEntry (mediaId: $id, status: $status, progress: $episode, repeat: $repeat) {
        id
        status
        progress
        repeat
    }
}`,
                variables = {
                    repeat: 0,
                    id: playerData.nowPlaying[0].id,
                    status: "CURRENT",
                    episode: parseInt(playerData.nowPlaying[1])
                }
            if (parseInt(playerData.nowPlaying[1]) == playerData.nowPlaying[0].episodes) {
                variables.status = "COMPLETED"
                if (res.data.MediaList.status == "COMPLETED") {
                    variables.repeat = res.data.MediaList.repeat + 1
                }
            }
            let options = {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem("ALtoken"),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    variables: variables
                })
            }
            fetch("https://graphql.anilist.co", options).catch((error) => console.error(error))
        }
    }
}
let alResponse
async function searchAnime(a) { //search bar functionality
    let frag = document.createDocumentFragment(),
        browse = document.querySelector(".browse")
    browse.textContent = '';
    browse.appendChild(skeletonCard)
    a ? alResponse = await alRequest({ method: "SearchName", name: a }) : alResponse = await alRequest({ method: "Trending" })
    try {
        alResponse.data.Page.media.forEach(media => {
            let template = cardCreator(media)
            template.onclick = () => {
                viewAnime(media)
            }
            frag.appendChild(template)
        })
    } catch (e) {
        console.error(e)
    }
    browse.textContent = '';
    browse.appendChild(frag)
}

//these really shouldnt be global
let detailsfrag = document.createDocumentFragment()
let details = {
    averageScore: "Average Score",
    // duration: "Episode Duration",
    // episodes: "Episodes",
    // format: "Format",
    genres: "Genres",
    // season: "Season",
    // seasonYear: "Year",
    status: "Status",
    english: "English",
    romaji: "Romaji",
    native: "Native",
    synonyms: "Synonyms"
}
const episodeRx = /Episode (\d+) - (.*)/;
// this is fucked beyond belief, this is why you use frameworks
function viewAnime(media) {
    halfmoon.showModal("view")
    view.setAttribute("style", `background-image: url(${media.bannerImage}) !important`)
    viewImg.src = media.coverImage.extraLarge
    viewTitle.textContent = media.title.userPreferred
    viewDesc.innerHTML = media.description || ""

    viewDetails.innerHTML = ""
    detailsCreator(media)
    viewDetails.appendChild(detailsfrag)
    if (media.nextAiringEpisode) {
        let temp = document.createElement("p")
        temp.innerHTML = `<span class="font-weight-bold">Airing</span><br><span class="text-muted"> Episode ${media.nextAiringEpisode.episode}: ${toTS(media.nextAiringEpisode.timeUntilAiring)}</span>`
        viewDetails.prepend(temp)
    }
    viewSeason.innerHTML = `${(media.season ? media.season.toLowerCase() + " " : "") + (media.seasonYear ? media.seasonYear : "")}`
    viewMediaInfo.innerHTML = `${media.format ? "<span>" + media.format + "</span>" : ""}${media.episodes ? "<span>" + media.episodes + " Episodes</span>" : ""}${media.duration ? "<span>" + media.duration + " Minutes</span>" : ""}`
    viewPlay.onclick = () => { nyaaSearch(media, 1); halfmoon.toggleModal("view") }
    if (media.trailer) {
        viewTrailer.removeAttribute("disabled", "")
        viewTrailer.onclick = () =>
            trailerPopup(media.trailer)
    } else {
        viewTrailer.setAttribute("disabled", "")
    }
    if (media.status == "NOT_YET_RELEASED") {
        viewPlay.setAttribute("disabled", "")
    } else {
        viewPlay.removeAttribute("disabled", "")
    }
    if (media.relations.edges.length) {
        viewRelationsGallery.classList.remove("d-none")
        viewRelationsGallery.innerHTML = ""
        let frag = document.createDocumentFragment()
        media.relations.edges.forEach(edge => {
            let template = document.createElement("div")
            template.classList.add("card", "m-0", "p-0")
            template.innerHTML = `
            <div class="row h-full">
            <div class="col-4">
                <img loading="lazy" src="${edge.node.coverImage.medium}"
                    class="cover-img w-full h-full">
            </div>
            <div class="col-8 h-full card-grid">
                <div class="px-15 py-10">
                    <p class="m-0 text-capitalize font-weight-bold font-size-14">
                        ${edge.node.title.userPreferred}
                    </p>
                    <p class="m-0 text-capitalize font-size-12">
                        ${edge.relationType.toLowerCase()}
                    </p>
                </div>
                <span>
                </span>
                <div class="px-15 pb-10 pt-5 details text-capitalize font-size-12">
                    <span>${edge.node.type.toLowerCase()}</span><span>${edge.node.status.toLowerCase()}</span>
                </div>
            </div>
        </div>`
            template.onclick = async () => {
                halfmoon.hideModal("view")
                let res = await alRequest({ method: "SearchIDSingle", id: edge.node.id })
                viewAnime(res.data.Media)
            }
            frag.appendChild(template)
        })
        viewRelationsGallery.appendChild(frag)
    } else {
        viewRelationsGallery.classList.add("d-none")
    }
    viewEpisodes.onclick = () => {
        viewEpisodesWrapper.classList.toggle("hidden")
    }
    viewSynonym.onclick = () => {
        store[viewSynonymText.value] = media
        viewSynonymText.value = ""
        localStorage.setItem("store", JSON.stringify(store))
    }
    episodes.innerHTML = ""
    if (media.streamingEpisodes.length) {
        viewEpisodesWrapper.classList.add("hidden")
        viewEpisodes.removeAttribute("disabled", "")
        let frag = document.createDocumentFragment()
        media.streamingEpisodes.forEach(episode => {
            let temp = document.createElement("div")
            temp.classList.add("position-relative", "w-250", "rounded", "mr-10", "overflow-hidden", "pointer")
            temp.innerHTML = `
            <img loading="lazy" src="${episode.thumbnail}" class="w-full h-full">
            <div class="position-absolute ep-title w-full p-10 text-truncate bottom-0">${episode.title}</div>`
            temp.onclick = () => { nyaaSearch(media, episodeRx.exec(episode.title)[1]); halfmoon.toggleModal("view") }
            frag.appendChild(temp)
        })
        episodes.appendChild(frag)
    } else {
        viewEpisodesWrapper.classList.add("hidden")
        viewEpisodes.setAttribute("disabled", "")
    }
}
function trailerPopup(trailer) {
    trailerVideo.src = ""
    halfmoon.toggleModal("trailer")
    switch (trailer.site) { // should support the other possible sites too, but i cant find any examples
        case "youtube":
            trailerVideo.src = "https://www.youtube.com/embed/" + trailer.id
            break;
    }

}
//details list factory
function detailsCreator(entry) {
    if (entry) {
        Object.entries(entry).forEach(value => {
            let template = document.createElement("p")
            if (typeof value[1] == 'object') {
                if (Array.isArray(value[1])) {
                    if (details[value[0]] && value[1].length > 0) {
                        template.innerHTML = `<span class="font-weight-bold">${details[value[0]]}</span><br><span class="text-muted">${value[1].map(key => (key)).join(', ')}</span>`
                        detailsfrag.appendChild(template)
                    }
                } else {
                    detailsCreator(value[1])
                }
            } else {
                if (details[value[0]]) {
                    template.innerHTML = `<span class="font-weight-bold">${details[value[0]]}</span><br><span class="text-muted">${value[1].toString()}</span>`
                    detailsfrag.appendChild(template)
                }
            }
        })
    }
}
function cardCreator(media, name, episode) {
    let template = document.createElement("div")
    template.classList.add("card", "m-0", "p-0")
    if (media) {
        template.innerHTML = `
    <div class="row h-full" style="--color:${media.coverImage.color || "#1890ff"};">
        <div class="col-4">
            <img loading="lazy" src="${media.coverImage.extraLarge || ""}"
                class="cover-img w-full h-full">
        </div>
        <div class="col-8 h-full card-grid">
            <div class="px-15 py-10 bg-very-dark">
                <h5 class="m-0 text-capitalize font-weight-bold">${media.title.userPreferred}${episode ? " - " + episode : ""}</h5>
                <p class="text-muted m-0 text-capitalize details">
                ${(media.format ? (media.format == "TV" ? "<span>" + media.format + " Show" : "<span>" + media.format.toLowerCase().replace(/_/g, " ")) : "") + "</span>"}
                ${media.episodes ? "<span>" + media.episodes + " Episodes</span>" : media.duration ? "<span>" + media.duration + " Minutes</span>" : ""}
                ${media.status ? "<span>" + media.status.toLowerCase().replace(/_/g, " ") + "</span>" : ""}
                ${media.season || media.seasonYear ? "<span>" + ((media.season.toLowerCase() || "") + " ") + (media.seasonYear || "") + "</span>" : ""}
                </p>
            </div>
            <div class="overflow-y-auto px-15 py-10 bg-very-dark card-desc">
                ${media.description}
            </div>
            <div class="px-15 pb-10 pt-5">
                ${media.genres.map(key => (`<span class="badge badge-pill badge-color text-dark mt-5 font-weight-bold">${key}</span> `)).join('')}
            </div>
        </div>
    </div>
    `
    } else {
        template.innerHTML = `
        <div class="row h-full">
            <div class="col-4 skeloader">
            </div>
            <div class="col-8 bg-very-dark px-15 py-10">
                ${name ? `<h5 class="m-0 text-capitalize font-weight-bold pb-10">${name + " - " + episode}</h5>` : 
                `<p class="skeloader w-300 h-25 rounded bg-dark">`}
                    <p class="skeloader w-150 h-10 rounded bg-dark"></p>
                    <p class="skeloader w-150 h-10 rounded bg-dark"></p>
                </p>
            </div>
        </div>
        `
    }
    return template
}
let skeletonCard = cardCreator()

const DOMPARSER = new DOMParser().parseFromString.bind(new DOMParser())

async function nyaaSearch(media, episode) {
    if (parseInt(episode) < 10) {
        episode = `0${episode}`
    }

    let table = document.querySelector("tbody.results")
    let results = await nyaaRss(media, episode)

    if (results.children.length == 0) {
        halfmoon.initStickyAlert({
            content: `Couldn't find torrent for ${media.title.userPreferred} Episode ${parseInt(episode)}! Try specifying a torrent manually.`,
            title: "Search Failed",
            alertType: "alert-danger",
            fillType: ""
        })
    } else {
        table.textContent = ""
        table.appendChild(results)
        halfmoon.toggleModal("tsearch")
    }
}

async function nyaaRss(media, episode) {
    let frag = document.createDocumentFragment(),
        ep = (media.status == "FINISHED" && settings.torrent9) ? `"01-${media.episodes}"|"01~${media.episodes}"|"batch"|"Batch"|"complete"|"Complete"|"+${episode}+"|"+${episode}v"` : `"+${episode}+"|"+${episode}v"`,
        url = new URL(`https://miru.kirdow.com/request/?url=https://nyaa.si/?page=rss$c=1_2$f=${settings.torrent3 == true ? 2 : 0}$s=seeders$o=desc$q=(${[...new Set(Object.values(media.title).concat(media.synonyms).filter(name => name != null))].join(")|(")})${ep}"${settings.torrent1}"`)
    res = await fetch(url)
    await res.text().then((xmlTxt) => {
        try {
            let doc = DOMPARSER(xmlTxt, "text/xml")
            if (settings.torrent2 && doc.querySelectorAll("infoHash")[0]) {
                addTorrent(doc.querySelectorAll("infoHash")[0].textContent, { media: media, episode: episode })
                halfmoon.toggleModal("tsearch")
            }
            doc.querySelectorAll("item").forEach((item, index) => {
                let i = item.querySelector.bind(item)
                let template = document.createElement("tr")
                template.innerHTML += `
                <th>${(index + 1)}</th>
                <td>${i("title").textContent}</td>
                <td>${i("size").textContent}</td>
                <td>${i("seeders").textContent}</td>
                <td>${i("leechers").textContent}</td>
                <td>${i("downloads").textContent}</td>
                <td class="pointer">Play</td>`
                template.onclick = () => { addTorrent(i('infoHash').textContent, { media: media, episode: episode }) }
                frag.appendChild(template)
            })

        } catch (e) {
            console.error(e)
        }
    })
    return frag
}
//resolve anime name based on torrent name and store it
async function resolveName(name, method, release) {
    if (!store.hasOwnProperty(name) && !alResponse.data.Page.media.some(media => (Object.values(media.title).concat(media.synonyms).filter(name => name != null).includes(name) && ((store[name] = media) && true)))) {
        let res = await alRequest({ perPage: 1, name: name, method: method })
        if (!res.data.Page.media[0]) {
            res = await alRequest({ name: name.replace(" (TV)", "").replace(` (${new Date().getFullYear()})`, ""), method: method, perPage: 1 })
        }
        if (settings.torrent7 && !res.data.Page.media[0] && release) {
            res = await alRequest({ name: name, method: "SearchName", perPage: 1, status: "RELEASING" })
        }
        store[name] = res.data.Page.media[0]
    }
    return store[name]
}

const nameParseRegex = {
    simple: /(\[.[^\]]*\]\ ?|\(.[^\)]*\)\ ?)?(.+?(?=\ \-\ \d{2,}|\ \–\ \d{2,}))?(\ \-\ |\ \–\ )?(\d{2,})?(.*)?/i,
    fallback: /((?:\[[^\]]*\])*)?\s*((?:[^\d\[\.](?!S\d))*)?\s*((?:S\d+[^\w\[]*E?)?[\d\-]*)\s*(.*)?/i
}
let store = JSON.parse(localStorage.getItem("store")) || {},
    lastResult

async function releasesRss(limit) {
    let frag = document.createDocumentFragment(),
        url
    if (Object.values(torrent4list.options).filter(item => item.value == settings.torrent4)[0]) {
        //add my own cors proxy for erai
        url = settings.torrent4 == "Erai-raws" ? new URL(Object.values(torrent4list.options).filter(item => item.value == settings.torrent4)[0].innerText + settings.torrent1 + "-magnet") : new URL(Object.values(torrent4list.options).filter(item => item.value == settings.torrent4)[0].innerText + settings.torrent1)
    } else {
        url = settings.torrent4 + settings.torrent1 // add custom RSS
    }
    let res = await fetch(url)
    await res.text().then(async (xmlTxt) => {
        try {
            let doc = DOMPARSER(xmlTxt, "text/xml")
            if (lastResult != doc) {
                lastResult = doc
                let items = doc.querySelectorAll("item")
                for (let l = 0; l < (limit || items.length); l++) {
                    let i = items[l].querySelector.bind(items[l]),
                        regexParse = nameParseRegex.simple.exec(i("title").textContent),
                        episode
                    if (!regexParse[2]) {
                        regexParse = nameParseRegex.fallback.exec(i("title").textContent)
                        episode = regexParse[3]
                    } else {
                        episode = regexParse[4]
                    }

                    let media = await resolveName(regexParse[2], "SearchName", true),
                        template = cardCreator(media, regexParse[2], episode)
                    template.onclick = async () => {
                        addTorrent(i('link').textContent, { media: media, episode: episode })
                        let res = await alRequest({ id: media.id, method: "SearchIDSingle" })
                        store[regexParse[2]] = res.data.Media // force updates entry data on play in case its outdated, needs to be made cleaner and somewhere else...
                    }
                    frag.appendChild(template)
                }
            }
        } catch (e) {
            console.error(e)
        }
    })
    localStorage.setItem("store", JSON.stringify(store))
    return frag
}
//latest releases auto-update
// setInterval(() => {
//     if (document.location.hash == "#releases") {
//         releasesRss()
//     }
// }, 30000);
let alID // login icon 
async function loadAnime() {
    await searchAnime()
    loadOfflineStorage()
    if (localStorage.getItem("ALtoken")) {
        alRequest({ method: "Viewer" }).then(result => {
            oauth.removeAttribute("href")
            oauth.setAttribute("data-title", `${result.data.Viewer.name}\nClick To Logout`)
            oauth.innerHTML = `<img src="${result.data.Viewer.avatar.medium}" class="m-0">`
            oauth.onclick = () => {
                localStorage.removeItem("ALtoken");
                location.reload()
            }
            alID = result.data.Viewer.id
            loadHomePage()
        })
    } else {
        loadHomePage()
        home.classList.add("noauth")
    }

}
loadAnime()