import os
import asyncio
import json

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from authlib.integrations.starlette_client import OAuth
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from google import genai

from .db import get_db, User, Interaction
from .tmdb import TMDB
from .recommender import rank


load_dotenv()

app = FastAPI(title="What2Watch")

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "dev-only-change-me"),
    https_only=False,
    same_site="lax",
    max_age=60 * 60 * 24 * 14,
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

oauth = OAuth()

oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url=(
        "https://accounts.google.com/.well-known/openid-configuration"
    ),
    client_kwargs={"scope": "openid email profile"},
)

tmdb = TMDB()


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"user": request.session.get("user")},
    )


# --------------------------------------------------
# GOOGLE LOGIN
# --------------------------------------------------

@app.get("/login/google")
async def login_google(request: Request):
    if not os.getenv("GOOGLE_CLIENT_ID") or not os.getenv(
        "GOOGLE_CLIENT_SECRET"
    ):
        return JSONResponse(
            {
                "error": (
                    "Google OAuth is not configured. "
                    "Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
                )
            },
            status_code=503,
        )

    redirect_uri = request.url_for("auth_google")
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
    )


@app.get("/auth/google", name="auth_google")
async def auth_google(
    request: Request,
    db: Session = Depends(get_db),
):
    token = await oauth.google.authorize_access_token(request)

    userinfo = token.get("userinfo")

    if not userinfo:
        userinfo = await oauth.google.parse_id_token(request, token)

    if not userinfo or not userinfo.get("sub"):
        raise HTTPException(
            status_code=401,
            detail="Could not verify your Google account.",
        )

    google_sub = userinfo["sub"]

    user = (
        db.query(User)
        .filter(User.google_sub == google_sub)
        .first()
    )

    if not user:
        user = User(
            google_sub=google_sub,
            email=userinfo.get("email", ""),
            name=userinfo.get("name", "Movie fan"),
            picture=userinfo.get("picture"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    request.session["user"] = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
    }

    return RedirectResponse("/", status_code=303)


@app.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return JSONResponse({"ok": True})


# --------------------------------------------------
# AUTHENTICATED USER HELPER
# --------------------------------------------------

def current_user(request: Request, db: Session):
    session_user = request.session.get("user")

    if not session_user:
        raise HTTPException(
            status_code=401,
            detail="Sign in with Google to continue.",
        )

    user = db.get(User, session_user["id"])

    if not user:
        request.session.clear()
        raise HTTPException(
            status_code=401,
            detail="Your session has expired. Please sign in again.",
        )

    return user


# --------------------------------------------------
# MOVIE SEARCH AND DETAILS
# --------------------------------------------------

@app.get("/api/search")
async def search(q: str = ""):
    if not q.strip():
        return []

    return (await tmdb.search(q))[:12]


@app.get("/api/movie/{movie_id}")
async def movie(movie_id: int):
    return await tmdb.details(movie_id)


@app.get("/api/trending")
async def trending():
    data = await tmdb.trending()
    return data.get("results", [])[:20]


@app.get("/api/discover")
async def discover(
    genre_id: int | None = None,
    min_rating: float = 0,
    year: int | None = None,
    sort: str = "popularity.desc",
):
    params = {
        "sort_by": sort,
        "vote_count.gte": 100,
        "vote_average.gte": max(0, min(min_rating, 10)),
    }

    if genre_id:
        params["with_genres"] = genre_id

    if year:
        params["primary_release_year"] = year

    data = await tmdb.discover(**params)
    return data.get("results", [])[:20]


@app.get("/api/genres")
async def genres():
    return await tmdb.genres()


# --------------------------------------------------
# SAVE MOVIE INTERACTIONS
# --------------------------------------------------

@app.post("/api/interactions")
async def interaction(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
):
    user = current_user(request, db)

    try:
        movie_id = int(payload["movie_id"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="A valid movie_id is required.",
        )

    action = payload.get("action", "saved")

    existing = (
        db.query(Interaction)
        .filter_by(
            user_id=user.id,
            movie_id=movie_id,
            action=action,
        )
        .first()
    )

    if not existing:
        db.add(
            Interaction(
                user_id=user.id,
                movie_id=movie_id,
                action=action,
                rating=payload.get("rating"),
                title=payload.get("title", ""),
                poster_path=payload.get("poster_path"),
            )
        )
        db.commit()

    return {"ok": True}
@app.delete("/api/interactions/{movie_id}")
async def remove_saved_movie(
    movie_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    user = current_user(request, db)

    interaction = (
        db.query(Interaction)
        .filter_by(
            user_id=user.id,
            movie_id=movie_id,
            action="saved"
        )
        .first()
    )

    if not interaction:
        raise HTTPException(
            status_code=404,
            detail="Saved movie not found."
        )

    db.delete(interaction)
    db.commit()

    return {"ok": True}


# --------------------------------------------------
# USER PROFILE
# --------------------------------------------------

@app.get("/api/profile")
async def profile(
    request: Request,
    db: Session = Depends(get_db),
):
    user = current_user(request, db)

    items = (
        db.query(Interaction)
        .filter_by(user_id=user.id)
        .order_by(Interaction.created_at.desc())
        .limit(100)
        .all()
    )

    return {
        "user": {
            "name": user.name,
            "picture": user.picture,
        },
        "interactions": [
            {
                "movie_id": item.movie_id,
                "action": item.action,
                "rating": item.rating,
                "title": item.title,
                "poster_path": item.poster_path,
            }
            for item in items
        ],
    }


# --------------------------------------------------
# PERSONALIZED MOVIE RECOMMENDATIONS
# --------------------------------------------------

@app.post("/api/recommend")
async def recommend(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
):
    user = current_user(request, db)

    try:
        seed_id = int(payload["movie_id"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="A valid movie_id is required.",
        )

    seed = await tmdb.details(seed_id)

    watched = {
        item.movie_id
        for item in (
            db.query(Interaction)
            .filter_by(user_id=user.id)
            .all()
        )
    }

    seed_genres = seed.get("genres") or []

    genre_names = [
        genre.get("name")
        for genre in seed_genres
        if genre.get("name")
    ]

    params = {
        "sort_by": "popularity.desc",
        "vote_count.gte": 100,
    }

    genre_ids = [
        str(genre["id"])
        for genre in seed_genres
        if genre.get("id")
    ]

    if genre_ids:
        params["with_genres"] = ",".join(genre_ids)

    data = await tmdb.discover(**params)
    pool = data.get("results", [])[:40]

    pool = [
        item
        for item in pool
        if item.get("id") != seed_id
        and item.get("id") not in watched
    ]

    enriched = []

    for item in pool[:24]:
        try:
            enriched.append(
                await tmdb.details(item["id"])
            )
        except Exception as error:
            print("Movie details error:", repr(error))

    return rank(seed, enriched, genre_names)[:8]


# --------------------------------------------------
# CHATBOT HELPERS
# --------------------------------------------------

GENRE_IDS = {
    "action": 28,
    "adventure": 12,
    "animation": 16,
    "comedy": 35,
    "crime": 80,
    "documentary": 99,
    "drama": 18,
    "family": 10751,
    "fantasy": 14,
    "horror": 27,
    "mystery": 9648,
    "romance": 10749,
    "romantic": 10749,
    "sci-fi": 878,
    "science fiction": 878,
    "thriller": 53,
    "war": 10752,
    "western": 37,
}

LANGUAGE_CODES = {
    "hindi": "hi",
    "bollywood": "hi",
    "korean": "ko",
    "k-drama": "ko",
    "korean drama": "ko",
    "korean movie": "ko",
    "tamil": "ta",
    "telugu": "te",
    "japanese": "ja",
    "malayalam": "ml",
    "kannada": "kn",
    "bengali": "bn",
    "marathi": "mr",
    "english": "en",
    "hollywood": "en",
    "french": "fr",
    "spanish": "es",
    "thai": "th",
    "chinese": "zh",
}

RECOMMENDATION_WORDS = (
    "recommend",
    "recommendation",
    "suggest",
    "suggestion",
    "movies like",
    "movie like",
    "similar to",
    "movie for",
    "movies for",
    "watch",
    "something to watch",
    "best movies",
    "feel-good",
    "feel good",
    "mood",
    "give me",
    "show me",
    "i want",
    "i need",
    "looking for",
    "romantic movies",
    "movie recommendations",
)


def detect_genre(text: str):
    for genre, genre_id in sorted(
        GENRE_IDS.items(),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        if genre in text:
            return genre_id

    return None


def detect_language(text: str):
    for language, code in sorted(
        LANGUAGE_CODES.items(),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        if language in text:
            return code

    return None


def chatbot_movie_card(movie: dict):
    return {
        "id": movie.get("id"),
        "title": (
            movie.get("title")
            or movie.get("name")
            or "Untitled"
        ),
        "poster_path": movie.get("poster_path"),
        "vote_average": movie.get("vote_average") or 0,
        "release_date": (
            movie.get("release_date")
            or movie.get("first_air_date")
            or ""
        ),
    }


async def find_chat_movies(message: str):
    text = message.lower().strip()

    genre_id = detect_genre(text)
    language = detect_language(text)

    recommendation_request = any(
        word in text for word in RECOMMENDATION_WORDS
    )

    # Detect movie-title searches versus broad recommendations.
    # Specific genre/language preferences take priority.
    params = {
        "sort_by": "popularity.desc",
        "page": 1,
        "vote_count.gte": 10,
    }

    if genre_id:
        params["with_genres"] = genre_id

    if language:
        params["with_original_language"] = language

    # Genre/language requests: fetch matching movies.
    if genre_id or language:
        data = await tmdb.discover(**params)
        return data.get("results", [])

    # Broad requests: fetch popular movies.
    if recommendation_request:
        data = await tmdb.discover(
            sort_by="popularity.desc",
            page=1,
            **{"vote_count.gte": 100},
        )
        return data.get("results", [])

    # Specific movie title or "similar to [title]" requests:
    # search the title instead of returning unrelated popular movies.
    results = await tmdb.search(message)
    return results

async def find_movies_by_titles(titles: list[str]):
    matched_movies = []
    seen_ids = set()

    for title in titles[:6]:
        try:
            results = await tmdb.search(title)
        except Exception as error:
            print(f"TMDB title search error for {title!r}:", repr(error))
            continue

        # Only accept a close title match, not an unrelated first result.
        normalized_title = title.casefold().strip()
        best_match = None

        for movie in results:
            movie_title = (
                movie.get("title")
                or movie.get("name")
                or ""
            ).casefold().strip()

            if (
                movie.get("id")
                and movie.get("poster_path")
                and movie_title == normalized_title
            ):
                best_match = movie
                break

        if best_match and best_match["id"] not in seen_ids:
            seen_ids.add(best_match["id"])
            matched_movies.append(chatbot_movie_card(best_match))

    return matched_movies

# --------------------------------------------------
# AI CHATBOT
# --------------------------------------------------

@app.post("/api/chat")
async def chat(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
):
    current_user(request, db)

    message = payload.get("message", "")

    if not isinstance(message, str):
        raise HTTPException(
            status_code=400,
            detail="Message must be text.",
        )

    message = message.strip()

    if not message:
        return {
            "reply": "Tell me what kind of movie you're looking for!",
            "movies": [],
        }

    if len(message) > 1000:
        raise HTTPException(
            status_code=400,
            detail="Please keep your message under 1000 characters.",
        )

    key = os.getenv("GEMINI_API_KEY", "").strip()

    if not key:
        return {
            "reply": "My AI assistant isn't configured yet. Please check the server configuration.",
            "movies": [],
        }

    system = """
You are What2Watch, a friendly movie discovery assistant.

Recommend real movies from Bollywood, Hollywood, regional Indian,
Korean, and other film industries.

Understand the user's genre, language, mood, release period, actor,
director, and similar-movie preferences.

Return ONLY valid JSON in this format:
{
  "reply": "A short, natural response to the user.",
  "movies": ["Movie Title 1", "Movie Title 2"]
}

For recommendation requests, return up to 6 relevant movie titles.
For similar-movie requests, recommend genuinely similar movies.
For a specific movie request, include that movie when appropriate.
If the request is unclear, ask one short clarifying question
and return an empty movies list.

Do not use Markdown fences or text outside the JSON.
Do not invent movie titles.
"""

    models = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.5-flash",
    ]

    try:
        client = genai.Client(api_key=key)
    except Exception as error:
        print("Gemini client error:", repr(error))
        return {
            "reply": "The AI assistant is temporarily unavailable. Please try again shortly.",
            "movies": [],
        }

    last_error = None

    for model in models:
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=f"{system}\n\nUser message: {message}",
                    config={
                        "response_mime_type": "application/json",
                    },
                ),
                timeout=12,
            )

            raw_reply = getattr(response, "text", None)

            if not raw_reply or not raw_reply.strip():
                last_error = f"{model} returned an empty response"
                continue

            try:
                ai_data = json.loads(raw_reply)
            except (json.JSONDecodeError, TypeError) as error:
                last_error = repr(error)
                print("Gemini JSON parsing error:", last_error)
                continue

            if not isinstance(ai_data, dict):
                last_error = "Gemini returned an unexpected JSON format"
                continue

            reply = str(ai_data.get("reply", "")).strip()
            titles = ai_data.get("movies", [])

            if not isinstance(titles, list):
                titles = []

            titles = [
                title.strip()
                for title in titles
                if isinstance(title, str) and title.strip()
            ][:6]

            matched_movies = await find_movies_by_titles(titles)

            return {
                "reply": reply or "Here are some movies you might enjoy.",
                "movies": matched_movies,
            }

        except asyncio.TimeoutError:
            last_error = f"{model} timed out"
            print("Gemini timeout:", model)

        except Exception as error:
            last_error = repr(error)
            print(f"Gemini error ({model}):", last_error)

    print("All Gemini models failed:", last_error)

    return {
        "reply": (
            " AI assistant is temporarily unavailable. "
            "Please try again shortly."
        ),
        "movies": [],
    }