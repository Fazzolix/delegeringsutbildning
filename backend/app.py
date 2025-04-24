# backend/app.py
import os
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from flask_session import Session
import redis
import sqlite3
from ai import ai_bp
from dotenv import load_dotenv
import logging
from urllib.parse import urlparse # Importera urlparse för att extrahera domän

# Konfigurera loggning
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Ladda miljövariabler
load_dotenv()

# Define an absolute path to the base directory of the backend
basedir = os.path.abspath(os.path.dirname(__file__))

# Initialize Flask app
app = Flask(__name__, static_folder=os.path.join(basedir, 'static'))

# --- Flask-Session Configuration ---
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'fallback-secret-key-change-me!')
if app.config['SECRET_KEY'] == 'fallback-secret-key-change-me!':
    logger.warning("Using fallback SECRET_KEY. Please set a strong SECRET_KEY environment variable.")

app.config['SESSION_TYPE'] = 'redis'
redis_url = os.getenv('REDIS_URL')
if not redis_url:
    logger.error("REDIS_URL is not set. Cannot configure Flask-Session with Redis.")
    app.config['SESSION_REDIS'] = None
else:
    try:
        redis_client = redis.from_url(redis_url, decode_responses=False)
        redis_client.ping()
        app.config['SESSION_REDIS'] = redis_client
        logger.info(f"Successfully connected to Redis at {redis_url.split('@')[-1]}")
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Failed to connect to Redis at {redis_url.split('@')[-1]}: {e}")
        app.config['SESSION_REDIS'] = None
    except Exception as e:
        logger.error(f"Error creating Redis client: {e}")
        app.config['SESSION_REDIS'] = None

# *** NYTT: Explicit Cookie-konfiguration ***
# Sätt Secure=True om din frontend körs på HTTPS (vilket den gör på Render)
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
# Sätt SameSite='Lax' som standard. 'None' kräver Secure=True och används om du
# bäddar in från helt olika domäner, 'Lax' är oftast bra för API-anrop från
# samma site eller subdomäner. Prova 'Lax' först.
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# Sätt Path till roten så cookien är giltig för hela backend-applikationen
app.config['SESSION_COOKIE_PATH'] = '/'

# Försök att sätta en gemensam toppdomän för cookien om möjligt
# Detta hjälper om frontend och backend är på olika subdomäner av onrender.com
# Exempel: frontend.onrender.com och backend.onrender.com
# Vi vill sätta Domain=.onrender.com (notera punkten i början)
# Detta görs BARA om både frontend och backend körs på Render/liknande domän.
# Om du kör lokalt eller på olika toppdomäner, sätt INTE SESSION_COOKIE_DOMAIN.
frontend_url_str = os.getenv('FRONTEND_URL', '')
backend_url_str = os.getenv('BACKEND_URL', '') # Antag att du har BACKEND_URL också? Annars hoppa över detta.

try:
    frontend_parsed = urlparse(frontend_url_str)
    backend_parsed = urlparse(backend_url_str)

    # Kontrollera om båda verkar vara på samma basdomän (t.ex. onrender.com)
    frontend_domain_parts = frontend_parsed.netloc.split('.')
    backend_domain_parts = backend_parsed.netloc.split('.')

    if len(frontend_domain_parts) >= 2 and len(backend_domain_parts) >= 2 and \
       frontend_domain_parts[-2:] == backend_domain_parts[-2:]: # Jämför de två sista delarna (t.ex. ['onrender', 'com'])
        base_domain = "." + ".".join(frontend_domain_parts[-2:])
        app.config['SESSION_COOKIE_DOMAIN'] = base_domain
        logger.info(f"Setting SESSION_COOKIE_DOMAIN to: {base_domain}")
    else:
        logger.info("Frontend and Backend URLs do not seem to share a common base domain. Not setting SESSION_COOKIE_DOMAIN.")
        # Låt SESSION_COOKIE_DOMAIN vara default (None), vilket binder den till exakt backend-domän.
except Exception as parse_err:
    logger.warning(f"Could not parse FRONTEND_URL/BACKEND_URL to set SESSION_COOKIE_DOMAIN: {parse_err}")

# ****************************************

# Initiera Flask-Session
if app.config.get('SESSION_REDIS'): # Använd .get() för att undvika KeyError om det inte sattes
    Session(app)
    logger.info("Flask-Session initialized with Redis backend.")
else:
    logger.error("Flask-Session could not be initialized with Redis due to connection issues.")
    # Överväg fallback eller exit

# --- CORS Configuration ---
# Hämta frontend URL för CORS
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
cors_origins = [frontend_url]
if "localhost" not in frontend_url: # Lägg till localhost för lokal utveckling om inte redan där
    cors_origins.append("http://localhost:3000")

logger.info(f"Configuring CORS for origins: {cors_origins}")

CORS(app,
     supports_credentials=True, # Krävs för att webbläsaren ska skicka cookies
     origins=cors_origins # Tillåt endast från specificerade origins
    )
# -------------------------


# Define an absolute path to the database
db_path = os.path.join(basedir, 'database.db')

# Register AI blueprint
app.register_blueprint(ai_bp)

# Initialize the database
def init_db():
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)')
            conn.commit()
        logger.info("Database initialized successfully.")
    except sqlite3.Error as e:
        logger.error(f"Database error during initialization: {e}")

init_db()

# Serve static files
@app.route('/static/<path:filename>')
def serve_static_files(filename):
    static_dir = app.static_folder
    logger.info(f"Attempting to serve static file: {filename} from {static_dir}")
    try:
        return send_from_directory(static_dir, filename)
    except FileNotFoundError:
         logger.warning(f"Static file not found: {os.path.join(static_dir, filename)}")
         return jsonify({"error": "File not found"}), 404
    except Exception as e:
        logger.error(f"Error serving static file {filename}: {e}")
        return jsonify({"error": "Could not serve file"}), 500

@app.route('/')
def index():
    return jsonify({"message": "Backend API is running! Refactored version with Redis sessions and explicit cookie settings."})

# API endpoint to save user name
@app.route('/api/user', methods=['POST'])
def save_user():
    data = request.get_json()
    name = data.get('name')
    if not name:
        logger.warning("Save user attempt failed: Name not provided.")
        return jsonify({'error': 'Name must be provided'}), 400
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute('INSERT INTO users (name) VALUES (?)', (name,))
            conn.commit()
        logger.info(f"User name saved: {name}")
        return jsonify({'message': 'Name saved successfully!'})
    except sqlite3.Error as e:
        logger.error(f"Database error saving user {name}: {e}")
        return jsonify({'error': 'Database error occurred'}), 500
    except Exception as e:
        logger.error(f"Unexpected error saving user {name}: {e}")
        return jsonify({'error': 'An unexpected error occurred'}), 500

if __name__ == '__main__':
    static_images_dir = os.path.join(basedir, 'static', 'images')
    if not os.path.exists(static_images_dir):
         os.makedirs(static_images_dir, exist_ok=True)
         logger.info(f"Created directory: {static_images_dir}")

    port = int(os.environ.get('PORT', 10000))
    is_debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1')
    logger.info(f"Starting Flask server on host 0.0.0.0, port {port}, Debug: {is_debug}")
    app.run(host='0.0.0.0', port=port, debug=is_debug)
