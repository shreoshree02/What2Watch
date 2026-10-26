const IMG = 'https://image.tmdb.org/t/p/w500';
const $ = s => document.querySelector(s);

function card(m) {
    return `
        <article class="movie" onclick="openMovie(${Number(m.id)})">
            <div class="poster"
                 style="background-image:url('${m.poster_path ? IMG + m.poster_path : ''}')">
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

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c]);
}

async function load() {
    const t = await fetch('/api/trending').then(r => r.json());
    $('#trendingGrid').innerHTML = t.map(card).join('');

    const g = await fetch('/api/genres').then(r => r.json());

    $('#genre').innerHTML =
        '<option value="">Any genre</option>' +
        g.map(x => `<option value="${Number(x.id)}">${esc(x.name)}</option>`).join('');

    await loadAuth();
}

async function loadAuth() {
    const r = await fetch('/api/profile', { cache: 'no-store' });
    const box = $('#auth');

    if (!r.ok) {
        box.innerHTML =
            '<a class="quick button" href="/login/google">Sign in with Google</a>';

        $('#profileBox').innerHTML = `
            <div class="profileempty">
                Sign in to build your movie taste profile and get personalized recommendations.
            </div>
        `;
        return;
    }

    const p = await r.json();

    box.innerHTML = `
        <button class="quick" onclick="logout()">
            ${esc((p.user.name || 'User').split(' ')[0])} · Log out
        </button>
    `;

    const interactions = p.interactions || [];
    const savedMovies = interactions.filter(movie => movie.action === 'saved');

    if (savedMovies.length === 0) {
        $('#profileBox').innerHTML = `
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
                src="${movie.poster_path ? 'https://image.tmdb.org/t/p/w342' + esc(movie.poster_path) : ''}"
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

    $('#profileBox').innerHTML = `
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
}

async function search() {
    const q = $('#search').value.trim();

    if (q.length < 2) {
        $('#searchResults').style.display = 'none';
        return;
    }

    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const x = await r.json();

    $('#searchResults').innerHTML = x.slice(0, 6).map(m => `
        <div class="result" onclick="openMovie(${Number(m.id)})">
            <img src="${m.poster_path ? IMG + m.poster_path : ''}" alt="">
            <div>
                <b>${esc(m.title || 'Untitled')}</b>
                <div class="muted">
                    ${esc((m.release_date || '').slice(0, 4))} ·
                    ★ ${Number(m.vote_average || 0).toFixed(1)}
                </div>
            </div>
        </div>
    `).join('');

    $('#searchResults').style.display = x.length ? 'block' : 'none';
}

let timer;

$('#search').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
        search().catch(error => console.error('Search error:', error));
    }, 250);
});

async function openMovie(id) {
    $('#modal').classList.remove('hidden');
    $('#modalBody').innerHTML = '<p>Loading…</p>';

    try {
        const response = await fetch('/api/movie/' + Number(id));
        if (!response.ok) throw new Error('Could not load movie details.');

        const m = await response.json();

        $('#modalBody').innerHTML = `
            <div class="detail">
                <img
                    class="detailposter"
                    src="${m.poster_path ? IMG + m.poster_path : ''}"
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
                        <button class="primary"
                                onclick="recommend(${Number(m.id)})">
                            Find my next watch →
                        </button>

                        <button class="secondary"
                                id="saveMovieButton"
                                onclick="saveMovie(${JSON.stringify(m).replace(/</g, '\\u003c').replace(/'/g, '&#39;')})">
                            ♡ Save
                        </button>
                    </div>

                    <div id="recs" style="margin-top:30px"></div>
                </div>
            </div>
        `;
    } catch (error) {
        $('#modalBody').innerHTML =
            `<p class="muted">${esc(error.message || 'Could not load movie details.')}</p>`;
    }
}

function closeModal() {
    $('#modal').classList.add('hidden');
}

async function recommend(id) {
    $('#recs').innerHTML = '<p>Finding your matches…</p>';

    try {
        const r = await fetch('/api/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ movie_id: Number(id) })
        });

        if (r.status === 401) {
            $('#recs').innerHTML =
                '<div class="muted">Sign in first to personalize recommendations.</div>';
            return;
        }

        const x = await r.json();

        if (!r.ok) {
            throw new Error(x.detail || 'Could not find recommendations.');
        }

        $('#recs').innerHTML =
            '<h3>Because you liked this</h3><div class="grid">' +
            x.map(card).join('') +
            '</div>';
    } catch (error) {
        $('#recs').innerHTML =
            `<div class="muted">${esc(error.message || 'Could not find recommendations.')}</div>`;
    }
}

async function saveMovie(m) {
    const r = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            movie_id: Number(m.id),
            title: m.title,
            poster_path: m.poster_path,
            action: 'saved'
        })
    });

    if (r.status === 401) {
        location.href = '/login/google';
    } else if (r.ok) {
        alert('Saved to My Pulse ✦');
        await loadAuth();
    } else {
        alert('Could not save this movie. Please try again.');
    }
}

async function removeSavedMovie(movieId, event) {
    if (event) {
        event.stopPropagation();
    }

    movieId = Number(movieId);

    if (!Number.isInteger(movieId) || movieId <= 0) {
        alert('Invalid movie.');
        return;
    }

    if (!confirm('Remove this movie from My Pulse?')) {
        return;
    }

    try {
        const response = await fetch(
            `/api/interactions/${movieId}`,
            { method: 'DELETE' }
        );

        if (response.status === 401) {
            alert('Please sign in again.');
            await loadAuth();
            return;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.detail || 'Could not remove this movie.');
        }

        await loadAuth();
    } catch (error) {
        alert(error.message || 'Could not remove this movie.');
        console.error('Remove movie error:', error);
    }
}

async function runDiscover() {
    const g = $('#genre').value;
    const s = $('#sort').value;
    const rating = $('#minRating').value;

    let u = `/api/discover?sort=${encodeURIComponent(s)}&min_rating=${encodeURIComponent(rating || 0)}`;

    if (g) {
        u += `&genre_id=${encodeURIComponent(g)}`;
    }

    const x = await fetch(u).then(r => r.json());
    $('#discoverGrid').innerHTML = x.map(card).join('');
}

function discoverMood(g) {
    $('#genre').value = g;
    document.querySelector('#discover').scrollIntoView({ behavior: 'smooth' });
    runDiscover();
}

/* Chat window controls */

let chatBusy = false;
let chatSessionCheck = 0;

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

    const opening = chat.classList.contains('hidden');

    if (!opening) {
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
    const chat = $('#chat');

    if (chat) {
        chat.classList.add('hidden');
    }

    chatSessionCheck++;
}

async function sendChat() {
    const input = $('#chatInput');
    const chatMessages = $('#chatmsgs');

    if (!input || !chatMessages) return;

    const message = input.value.trim();

    if (!message || chatBusy) return;

    const isLoggedIn = await checkChatLogin();

    if (!isLoggedIn) {
        showChatWelcome(false);
        return;
    }

    chatBusy = true;

    chatMessages.insertAdjacentHTML(
        'beforeend',
        `<div class="bubble me">${esc(message)}</div>`
    );

    input.value = '';

    const thinkingId = `chatThinking${Date.now()}`;

    chatMessages.insertAdjacentHTML(
        'beforeend',
        `<div class="bubble ai" id="${thinkingId}">Thinking<span class="dots"></span></div>`
    );

    chatMessages.scrollTop = chatMessages.scrollHeight;

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

        if (response.status === 401) {
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
                                    style="background-image:url('${movie.poster_path ? IMG + movie.poster_path : ''}')">
                                </div>

                                <div class="moviebody">
                                    <h3>${esc(movie.title || 'Untitled')}</h3>

                                    <div class="meta">
                                        <span>
                                            ${esc((movie.release_date || '').slice(0, 4) || '—')}
                                        </span>

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
        chatMessages.insertAdjacentHTML('beforeend', html);

    } catch (error) {
        document.getElementById(thinkingId)?.remove();

        const errorMessage = error.name === 'AbortError'
            ? 'The response took too long. Please try again.'
            : error.message === 'Failed to fetch'
                ? 'Could not connect to the server. Check your connection and try again.'
                : error.message || 'Something went wrong. Please try again.';

        chatMessages.insertAdjacentHTML(
            'beforeend',
            `<div class="bubble ai">${esc(errorMessage)}</div>`
        );

        console.error('Chat error:', error);

    } finally {
        clearTimeout(timeoutId);
        chatBusy = false;
        chatMessages.scrollTop = chatMessages.scrollHeight;
        input.focus();
    }
}

document.addEventListener('keydown', function (event) {
    if (
        event.key === 'Enter' &&
        document.activeElement?.id === 'chatInput'
    ) {
        event.preventDefault();
        sendChat();
    }
});

async function logout() {
    await fetch('/logout', { method: 'POST' });
    location.reload();
}

load();