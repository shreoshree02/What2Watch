const IMG = 'https://image.tmdb.org/t/p/w500';
const $ = s => document.querySelector(s);

let timer;
let chatBusy = false;
let chatSessionCheck = 0;
let currentMovie = null;

// Safely escape text before inserting it into HTML.
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c]);
}

// Fetch JSON and report useful errors when the server fails.
async function apiJSON(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message =
            data?.detail ||
            data?.error ||
            `Request failed (${response.status})`;
        throw new Error(message);
    }

    if (data === null) {
        throw new Error('The server returned an invalid response.');
    }

    return data;
}

function card(m) {
    return `
        <article class="movie" onclick="openMovie(${Number(m.id)})">
            <div class="poster"
                 style="background-image:url('${m.poster_path ? IMG + esc(m.poster_path) : ''}')">
            </div>
            <div class="moviebody">
                <h3>${esc(m.title || 'Untitled')}</h3>
                <div class="meta">
                    <span>${esc((m.release_date || '').slice(0, 4) || '—')}</span>
                    <span class="rating">★ ${Number(m.vote_average || 0).toFixed(1)}</span>
                </div>
            </div>
        </article>
    `;
}

// Load each homepage section independently so one failure
// does not prevent the sign-in button from appearing.
async function load() {
    await Promise.allSettled([
        loadTrending(),
        loadGenres()
    ]);

    await loadAuth();
}

async function loadTrending() {
    const grid = $('#trendingGrid');
    if (!grid) return;

    try {
        const movies = await apiJSON('/api/trending');

        if (!Array.isArray(movies)) {
            throw new Error('Unexpected trending response.');
        }

        grid.innerHTML = movies.map(card).join('');
    } catch (error) {
        grid.innerHTML =
            `<p class="muted">${esc(error.message || 'Could not load trending movies.')}</p>`;
        console.error('Trending error:', error);
    }
}

async function loadGenres() {
    const select = $('#genre');
    if (!select) return;

    try {
        const genres = await apiJSON('/api/genres');

        if (!Array.isArray(genres)) {
            throw new Error('Unexpected genres response.');
        }

        select.innerHTML =
            '<option value="">Any genre</option>' +
            genres.map(g =>
                `<option value="${Number(g.id)}">${esc(g.name)}</option>`
            ).join('');
    } catch (error) {
        select.innerHTML = '<option value="">Genres unavailable</option>';
        console.error('Genres error:', error);
    }
}

async function loadAuth() {
    const box = $('#auth');
    const profileBox = $('#profileBox');

    if (!box) return;

    try {
        const response = await fetch('/api/profile', {
            cache: 'no-store'
        });

        if (response.status === 401 || response.status === 403) {
            showSignedOut();
            return;
        }

        if (!response.ok) {
            throw new Error(`Profile request failed (${response.status})`);
        }

        const p = await response.json();

        if (!p.user) {
            showSignedOut();
            return;
        }

        box.innerHTML = `
            <button class="quick" type="button" onclick="logout()">
                ${esc((p.user.name || 'User').split(' ')[0])} · Log out
            </button>
        `;

        const interactions = Array.isArray(p.interactions)
            ? p.interactions
            : [];

        const savedMovies = interactions.filter(
            movie => movie.action === 'saved'
        );

        if (!profileBox) return;

        if (savedMovies.length === 0) {
            profileBox.innerHTML = `
                <div class="profileintro">
                    <div>
                        <b>${esc(p.user.name || 'User')}</b>
                        <div class="muted">0 saved movies</div>
                    </div>
                </div>
                <div class="profileempty">
                    You haven't saved any movies yet. Start exploring!
                </div>
            `;
            return;
        }

        const cards = savedMovies.map(movie => `
            <div class="pulsecard">
                <img
                    src="${movie.poster_path
                        ? 'https://image.tmdb.org/t/p/w342' + esc(movie.poster_path)
                        : ''}"
                    alt="${esc(movie.title || 'Movie poster')}"
                >
                <div class="pulseinfo">
                    <h3>${esc(movie.title || 'Untitled')}</h3>
                    <div class="muted">💾 Saved</div>
                    <button
                        class="secondary"
                        type="button"
                        onclick="removeSavedMovie(${Number(movie.movie_id)}, event)"
                    >
                        Remove
                    </button>
                </div>
            </div>
        `).join('');

        profileBox.innerHTML = `
            <div class="profileintro">
                <div>
                    <b>${esc(p.user.name || 'User')}</b>
                    <div class="muted">
                        ${savedMovies.length} saved movie${savedMovies.length === 1 ? '' : 's'}
                    </div>
                </div>
            </div>
            <div class="pulselist">${cards}</div>
        `;
    } catch (error) {
        console.error('Profile loading error:', error);

        // Don't silently leave the auth area blank on a network error.
        box.innerHTML = `
            <a class="quick button" href="/login/google">
                Sign in with Google
            </a>
        `;

        if (profileBox) {
            profileBox.innerHTML = `
                <div class="profileempty">
                    Profile couldn't load. Please refresh and try again.
                </div>
            `;
        }
    }
}

function showSignedOut() {
    const box = $('#auth');
    const profileBox = $('#profileBox');

    if (box) {
        box.innerHTML = `
            <a class="quick button" href="/login/google">
                Sign in with Google
            </a>
        `;
    }

    if (profileBox) {
        profileBox.innerHTML = `
            <div class="profileempty">
                Sign in to build your movie taste profile and get personalized recommendations.
            </div>
        `;
    }
}

// Movie search
async function search() {
    const input = $('#search');
    const results = $('#searchResults');

    if (!input || !results) return;

    const q = input.value.trim();

    if (q.length < 2) {
        results.style.display = 'none';
        return;
    }

    try {
        const movies = await apiJSON(
            '/api/search?q=' + encodeURIComponent(q)
        );

        if (!Array.isArray(movies)) {
            throw new Error('Unexpected search response.');
        }

        results.innerHTML = movies.slice(0, 6).map(m => `
            <div class="result" onclick="openMovie(${Number(m.id)})">
                <img
                    src="${m.poster_path ? IMG + esc(m.poster_path) : ''}"
                    alt=""
                >
                <div>
                    <b>${esc(m.title || 'Untitled')}</b>
                    <div class="muted">
                        ${esc((m.release_date || '').slice(0, 4))} ·
                        ★ ${Number(m.vote_average || 0).toFixed(1)}
                    </div>
                </div>
            </div>
        `).join('');

        results.style.display = movies.length ? 'block' : 'none';
    } catch (error) {
        console.error('Search error:', error);
        results.innerHTML =
            `<div class="muted">${esc(error.message || 'Search failed.')}</div>`;
        results.style.display = 'block';
    }
}

$('#search')?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 250);
});

// Movie details
async function openMovie(id) {
    id = Number(id);

    if (!Number.isInteger(id) || id <= 0) return;

    const modal = $('#modal');
    const body = $('#modalBody');

    if (!modal || !body) return;

    modal.classList.remove('hidden');
    body.innerHTML = '<p>Loading…</p>';

    try {
        const m = await apiJSON('/api/movie/' + id);

        currentMovie = m;

        body.innerHTML = `
            <div class="detail">
                <img
                    class="detailposter"
                    src="${m.poster_path ? IMG + esc(m.poster_path) : ''}"
                    alt=""
                >

                <div>
                    <div class="eyebrow">
                        ${esc((m.release_date || '').slice(0, 4))}
                        · ${Number(m.runtime || 0) || '?'} MIN
                    </div>

                    <h2>${esc(m.title || 'Untitled')}</h2>

                    <div class="meta">
                        <span class="rating">
                            ★ ${Number(m.vote_average || 0).toFixed(1)}
                        </span>
                        <span>${Number(m.vote_count || 0)} votes</span>
                    </div>

                    <div class="chips">
                        ${(m.genres || []).map(g =>
                            `<span class="chip">${esc(g.name)}</span>`
                        ).join('')}
                    </div>

                    <p>${esc(m.overview || 'No overview available.')}</p>

                    <div class="actions">
                        <button
                            class="primary"
                            type="button"
                            onclick="recommend(${Number(m.id)})"
                        >
                            Find my next watch →
                        </button>

                        <button
                            class="secondary"
                            id="saveMovieButton"
                            type="button"
                            onclick="saveCurrentMovie()"
                        >
                            ♡ Save
                        </button>
                    </div>

                    <div id="recs" style="margin-top:30px"></div>
                </div>
            </div>
        `;
    } catch (error) {
        body.innerHTML =
            `<p class="muted">${esc(error.message || 'Could not load movie details.')}</p>`;
        console.error('Movie details error:', error);
    }
}

function closeModal() {
    $('#modal')?.classList.add('hidden');
}

// Save uses the stored movie object rather than injecting JSON into
// an inline HTML attribute.
async function saveCurrentMovie() {
    if (!currentMovie) {
        alert('Please reopen the movie and try again.');
        return;
    }

    await saveMovie(currentMovie);
}

async function saveMovie(m) {
    if (!m || !Number.isInteger(Number(m.id)) || Number(m.id) <= 0) {
        alert('Invalid movie.');
        return;
    }

    const button = $('#saveMovieButton');

    if (button) {
        button.disabled = true;
        button.textContent = 'Saving…';
    }

    try {
        const response = await fetch('/api/interactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                movie_id: Number(m.id),
                title: m.title || 'Untitled',
                poster_path: m.poster_path || '',
                action: 'saved'
            })
        });

        if (response.status === 401 || response.status === 403) {
            location.href = '/login/google';
            return;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.detail || 'Could not save this movie.'
            );
        }

        alert('Saved to My Pulse ✦');
        await loadAuth();
    } catch (error) {
        console.error('Save movie error:', error);
        alert(error.message || 'Could not save this movie. Please try again.');
    } finally {
        if (button && document.body.contains(button)) {
            button.disabled = false;
            button.textContent = '♡ Save';
        }
    }
}

async function removeSavedMovie(movieId, event) {
    event?.stopPropagation();

    movieId = Number(movieId);

    if (!Number.isInteger(movieId) || movieId <= 0) {
        alert('Invalid movie.');
        return;
    }

    if (!confirm('Remove this movie from My Pulse?')) return;

    try {
        const response = await fetch(
            `/api/interactions/${movieId}`,
            { method: 'DELETE' }
        );

        if (response.status === 401 || response.status === 403) {
            alert('Please sign in again.');
            await loadAuth();
            return;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.detail || 'Could not remove this movie.'
            );
        }

        await loadAuth();
    } catch (error) {
        console.error('Remove movie error:', error);
        alert(error.message || 'Could not remove this movie.');
    }
}

// Recommendations
async function recommend(id) {
    const recs = $('#recs');
    if (!recs) return;

    recs.innerHTML = '<p>Finding your matches…</p>';

    try {
        const x = await apiJSON('/api/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ movie_id: Number(id) })
        });

        if (!Array.isArray(x)) {
            throw new Error('Unexpected recommendations response.');
        }

        recs.innerHTML =
            '<h3>Because you liked this</h3><div class="grid">' +
            x.map(card).join('') +
            '</div>';
    } catch (error) {
        if (/401|not authenticated|sign in/i.test(error.message)) {
            recs.innerHTML =
                '<div class="muted">Sign in first to personalize recommendations.</div>';
            return;
        }

        recs.innerHTML =
            `<div class="muted">${esc(error.message || 'Could not find recommendations.')}</div>`;
        console.error('Recommendation error:', error);
    }
}

// Discover movies
async function runDiscover() {
    const genre = $('#genre');
    const sort = $('#sort');
    const rating = $('#minRating');
    const grid = $('#discoverGrid');

    if (!genre || !sort || !rating || !grid) return;

    const params = new URLSearchParams({
        sort: sort.value,
        min_rating: rating.value || '0'
    });

    if (genre.value) {
        params.set('genre_id', genre.value);
    }

    grid.innerHTML = '<p class="muted">Loading movies…</p>';

    try {
        const movies = await apiJSON('/api/discover?' + params.toString());

        if (!Array.isArray(movies)) {
            throw new Error('Unexpected discover response.');
        }

        grid.innerHTML = movies.map(card).join('');
    } catch (error) {
        grid.innerHTML =
            `<p class="muted">${esc(error.message || 'Could not load movies.')}</p>`;
        console.error('Discover error:', error);
    }
}

function discoverMood(genreId) {
    const genre = $('#genre');
    const section = $('#discover');

    if (genre) genre.value = genreId;
    section?.scrollIntoView({ behavior: 'smooth' });

    runDiscover();
}

// Chat controls
function chatMessage(text, type = 'ai') {
    const messages = $('#chatmsgs');
    if (!messages) return;

    messages.insertAdjacentHTML(
        'beforeend',
        `<div class="bubble ${type}">${esc(text)}</div>`
    );

    messages.scrollTop = messages.scrollHeight;
}

function showChatWelcome(isLoggedIn) {
    const messages = $('#chatmsgs');
    if (!messages) return;

    messages.innerHTML = '';

    if (isLoggedIn) {
        chatMessage(
            "Hey! Welcome to What2Watch ✨ What are you in the mood to watch today?"
        );
    } else {
        chatMessage(
            'Sign in to chat with What2Watch AI. Use the Google sign-in button at the top-right to get started.'
        );
    }
}

async function checkChatLogin() {
    try {
        const response = await fetch('/api/profile', {
            cache: 'no-store'
        });

        return response.ok;
    } catch (error) {
        console.error('Could not check sign-in status:', error);
        return false;
    }
}

async function toggleChat() {
    const chat = $('#chat');
    if (!chat) return;

    if (!chat.classList.contains('hidden')) {
        chat.classList.add('hidden');
        chatSessionCheck++;
        return;
    }

    chat.classList.remove('hidden');
    showChatWelcome(false);

    const checkId = ++chatSessionCheck;
    const isLoggedIn = await checkChatLogin();

    if (
        checkId !== chatSessionCheck ||
        chat.classList.contains('hidden')
    ) {
        return;
    }

    showChatWelcome(isLoggedIn);

    if (isLoggedIn) {
        $('#chatInput')?.focus();
    }
}

function closeChat() {
    $('#chat')?.classList.add('hidden');
    chatSessionCheck++;
}

async function sendChat() {
    const input = $('#chatInput');
    const messages = $('#chatmsgs');

    if (!input || !messages || chatBusy) return;

    const message = input.value.trim();
    if (!message) return;

    const isLoggedIn = await checkChatLogin();

    if (!isLoggedIn) {
        showChatWelcome(false);
        return;
    }

    chatBusy = true;

    messages.insertAdjacentHTML(
        'beforeend',
        `<div class="bubble me">${esc(message)}</div>`
    );

    input.value = '';

    const thinkingId = `chatThinking${Date.now()}`;

    messages.insertAdjacentHTML(
        'beforeend',
        `<div class="bubble ai" id="${thinkingId}">Thinking<span class="dots"></span></div>`
    );

    messages.scrollTop = messages.scrollHeight;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
            signal: controller.signal
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            showChatWelcome(false);
            return;
        }

        if (!response.ok) {
            throw new Error(
                result.detail || 'The server could not process your request.'
            );
        }

        let html = `
            <div class="bubble ai">
                ${esc(result.reply || 'Here are some movies you might enjoy.')}
            </div>
        `;

        const movies = Array.isArray(result.movies) ? result.movies : [];

        if (movies.length) {
            html += `
                <div class="chat-movie-results">
                    <div class="chat-results-title">Movies for you</div>
                    <div class="chat-movie-grid">
                        ${movies.map(movie => `
                            <article class="movie chat-movie"
                                onclick="openMovie(${Number(movie.id)})">
                                <div class="poster"
                                    style="background-image:url('${movie.poster_path ? IMG + esc(movie.poster_path) : ''}')">
                                </div>
                                <div class="moviebody">
                                    <h3>${esc(movie.title || 'Untitled')}</h3>
                                    <div class="meta">
                                        <span>${esc((movie.release_date || '').slice(0, 4) || '—')}</span>
                                        <span class="rating">
                                            ★ ${Number(movie.vote_average || 0).toFixed(1)}
                                        </span>
                                    </div>
                                </div>
                            </article>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        document.getElementById(thinkingId)?.remove();
        messages.insertAdjacentHTML('beforeend', html);
    } catch (error) {
        document.getElementById(thinkingId)?.remove();

        const errorMessage = error.name === 'AbortError'
            ? 'The response took too long. Please try again.'
            : error.message === 'Failed to fetch'
                ? 'Could not connect to the server. Check your connection and try again.'
                : error.message || 'Something went wrong. Please try again.';

        messages.insertAdjacentHTML(
            'beforeend',
            `<div class="bubble ai">${esc(errorMessage)}</div>`
        );

        console.error('Chat error:', error);
    } finally {
        clearTimeout(timeoutId);
        chatBusy = false;
        messages.scrollTop = messages.scrollHeight;
        input.focus();
    }
}

document.addEventListener('keydown', event => {
    if (
        event.key === 'Enter' &&
        document.activeElement?.id === 'chatInput'
    ) {
        event.preventDefault();
        sendChat();
    }
});

async function logout() {
    try {
        await fetch('/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    }

    location.reload();
}

// Initialize the page.
load().catch(error => {
    console.error('Page initialization error:', error);
    // Even if initialization fails unexpectedly, try to show sign-in.
    showSignedOut();
});