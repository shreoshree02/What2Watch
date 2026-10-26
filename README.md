# What2Watch 🎬

What2Watch is an AI-powered movie discovery and recommendation web application that helps users explore movies, discover trending titles, and find their next watch through personalized recommendations and a conversational AI assistant.

# ✨ Features

- Google Authentication: Sign in using Google OAuth.
- Movie Search: Search for movies using data from the TMDB API.
- Trending Movies: Explore trending titles and discover popular films.
- Movie Details: View movie information, genres, cast, crew, keywords, and available video information where provided by TMDB.
- Movie Recommendations: Discover movies using content-based features and ranking signals.
- AI Chatbot: Get conversational movie suggestions and discuss movie preferences using the Gemini API.
- Chatbot Movie Results: Explore relevant movie results within the chat experience.
- My Pulse: Save movies to your personal collection and remove saved movies when you no longer want them.
- Genre Discovery: Browse and filter movies by genre.
- Responsive Interface: Enjoy a dark-themed interface with interactive movie cards, detailed movie views, and a conversational experience.
- Persistent User Interactions: Store user-related interactions in an SQLite database.

# 🛠️ Tech Stack

Technology| Purpose
Python| Backend development
FastAPI| Web framework and API endpoints
SQLite| Database
SQLAlchemy| Database ORM
TMDB API| Movie information and discovery
Google Gemini API| AI-powered chatbot
Google OAuth| User authentication
HTML, CSS and JavaScript| Frontend interface
Jinja2| HTML templating
Scikit-learn| Machine-learning and content-processing functionality

# ⚙️ Prerequisites

Before running the project, make sure you have:

- Python installed
- Git (optional, for version control)
- A TMDB API Read Access Token
- A Google Gemini API key
- Google OAuth credentials

# 🚀 Local Installation

1. Clone the repository

git clone YOUR_GITHUB_REPOSITORY_URL
cd What2Watch

If you already have the project locally, open its existing project directory instead.

2. Create and activate a virtual environment

Windows:

python -m venv .venv
.venv\Scripts\activate

3. Install dependencies

pip install -r requirements.txt

4. Configure environment variables

Create a ".env" file in the project root and add the credentials required by your application.

Example:

TMDB_ACCESS_TOKEN=your_tmdb_access_token
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
SESSION_SECRET=your_strong_random_secret

Important: These variable names are examples. Match them to the exact names read by your "main.py". Never commit your actual ".env" file or expose your API keys.

5. Configure Google OAuth

In Google Cloud Console:

1. Create or select a project.
2. Configure the OAuth consent screen as required.
3. Create OAuth credentials for a Web application.
4. Add the local callback URL used by your application to Authorized redirect URIs.

For example, if your callback route is "/auth/google/callback", the local URL would be:

http://localhost:8000/auth/google/callback

Use the actual callback path configured in "main.py".

6. Start the application

From the project root, run:

uvicorn main:app --reload

7. Open the application

Visit:

http://localhost:8000

# 🔐 Security Notes

- Keep API keys, OAuth secrets, and session secrets in environment variables.
- Keep ".env" excluded from Git using ".gitignore".
- Use HTTPS and secure cookie settings in production.
- Configure the production OAuth callback URL after deployment.
- Never publish credentials in your README, source code, or public repository.

# 🌐 Deployment

What2Watch can be deployed to a Python-compatible hosting platform such as Render.

Typical Render configuration:

Build command

pip install -r requirements.txt

Start command

uvicorn main:app --host 0.0.0.0 --port $PORT

Add the required environment variables through the hosting platform's environment settings. Update your Google OAuth authorized redirect URI to match the deployed application's callback URL.

If the application uses SQLite, configure persistent storage or an appropriate external database before relying on saved user data in production.

📁 Project Structure

What2Watch/
├── main.py
├── recommender.py
├── requirements.txt
├── .gitignore
├── README.md
├── templates/
├── static/
└── .env                 # Local only; do not upload

The exact structure may vary depending on where your frontend assets and templates are stored.

# 🔮 Future Improvements

Potential future enhancements include:

- More advanced personalized recommendations.
- Additional movie discovery and filtering options.
- Improved chatbot performance and recommendation relevance.
- Automated tests, API rate limiting, and production monitoring.
- More robust production database configuration.

# 🙌 Acknowledgements

- "The Movie Database (TMDB)" (https://www.themoviedb.org/) for movie data and discovery APIs.
- "Google AI Studio" (https://aistudio.google.com/) for access to the Gemini API.
- "FastAPI" (https://fastapi.tiangolo.com/) for the backend framework.

Movie data is provided by TMDB. What2Watch is an independent project and is not endorsed or certified by TMDB.

---

What2Watch — Find your next favourite movie.