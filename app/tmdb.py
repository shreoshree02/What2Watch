import os

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p/w500"


class TMDB:
    def __init__(self):
        self.token = os.getenv("TMDB_ACCESS_TOKEN", "").strip()

    async def get(self, path, **params):
        if not self.token:
            raise RuntimeError(
                "TMDB_ACCESS_TOKEN is not configured. "
                "Add it to your .env file."
            )

        headers = {
            "Authorization": f"Bearer {self.token}",
            "accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{BASE}{path}",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()

    async def search(self, q, language="en-US", page=1):
        q = q.strip()
        if not q:
            return []

        data = await self.get(
            "/search/movie",
            query=q,
            include_adult=False,
            language=language,
            page=page,
        )
        return data.get("results", [])

    async def search_tv(self, q, language="en-US", page=1):
        q = q.strip()
        if not q:
            return []

        data = await self.get(
            "/search/tv",
            query=q,
            include_adult=False,
            language=language,
            page=page,
        )
        return data.get("results", [])

    async def details(self, movie_id):
        return await self.get(
            f"/movie/{movie_id}",
            append_to_response="credits,videos,keywords",
        )

    async def discover(self, **params):
        params.setdefault("include_adult", False)
        params.setdefault("language", "en-US")
        params.setdefault("page", 1)

        return await self.get("/discover/movie", **params)

    async def trending(self):
        return await self.get("/trending/movie/week")

    async def genres(self):
        data = await self.get("/genre/movie/list")
        return data.get("genres", [])
