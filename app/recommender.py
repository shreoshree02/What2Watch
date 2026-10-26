from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def movie_text(movie):
    credits = movie.get("credits") or {}

    cast = " ".join(
        person.get("name", "")
        for person in (credits.get("cast") or [])[:8]
    )

    crew = " ".join(
        person.get("name", "")
        for person in (credits.get("crew") or [])
        if person.get("job") in {"Director", "Writer"}
    )

    genres = " ".join(
        genre.get("name", "")
        for genre in (movie.get("genres") or [])
    )

    keywords_data = movie.get("keywords") or {}
    keywords = " ".join(
        keyword.get("name", "")
        for keyword in (keywords_data.get("keywords") or [])
    )

    return " ".join([
        movie.get("title") or movie.get("name") or "",
        genres,
        keywords,
        cast,
        crew,
        movie.get("overview") or "",
    ]).strip()


def content_similarity(seed, candidates):
    if not candidates:
        return []

    documents = [movie_text(seed)] + [
        movie_text(movie) for movie in candidates
    ]

    # Avoid TF-IDF errors when every description is empty.
    if not any(document.strip() for document in documents):
        return [0.0] * len(candidates)

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        max_features=8000,
    )

    try:
        matrix = vectorizer.fit_transform(documents)
        return cosine_similarity(
            matrix[0:1],
            matrix[1:],
        ).ravel()
    except ValueError:
        # For example, all available words may be stop words.
        return [0.0] * len(candidates)


def rank(seed, candidates, preferred_genres=None):
    if not candidates:
        return []

    similarities = content_similarity(seed, candidates)
    preferred_genres = set(preferred_genres or [])

    scored = []

    for movie, similarity in zip(candidates, similarities):
        genres = {
            genre.get("name")
            for genre in (movie.get("genres") or [])
            if genre.get("name")
        }

        genre_boost = (
            0.08 if preferred_genres.intersection(genres) else 0.0
        )

        try:
            rating = float(movie.get("vote_average") or 0) / 10
        except (TypeError, ValueError):
            rating = 0.0

        try:
            popularity = min(
                max(float(movie.get("popularity") or 0), 0) / 100,
                1.0,
            )
        except (TypeError, ValueError):
            popularity = 0.0

        score = (
            0.68 * float(similarity)
            + 0.20 * rating
            + 0.12 * popularity
            + genre_boost
        )

        result = dict(movie)
        result["match_score"] = round(min(score, 1.0) * 100)
        scored.append(result)

    return sorted(
        scored,
        key=lambda movie: movie["match_score"],
        reverse=True,
    )