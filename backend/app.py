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

# *** Explicit Cookie-konfiguration ***
app.config['SESSION_COOKIE_SECURE'] = True # Krävs för SameSite='None' och HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None' # Ändrat till 'None' för cross-site context
app.config['SESSION_COOKIE_PATH'] = '/'

# --- DEBUG Logging för URL:er ---
frontend_url_str = os.getenv('FRONTEND_URL', '')
backend_url_str = os.getenv('BACKEND_URL', '')
logger.info(f"DEBUG: Read FRONTEND_URL from env: '{frontend_url_str}'")
logger.info(f"DEBUG: Read BACKEND_URL from env: '{backend_url_str}'")
# -----------------------------

# Försök att sätta en gemensam toppdomän för cookien
try:
    # Kontrollera att URL:erna inte är tomma innan parsning
    if not frontend_url_str or not backend_url_str:
         logger.warning("FRONTEND_URL or BACKEND_URL is empty. Cannot attempt to set SESSION_COOKIE_DOMAIN.")
         raise ValueError("URL missing") # Gå till except-blocket

    frontend_parsed = urlparse(frontend_url_str)
    backend_parsed = urlparse(backend_url_str)

    # Kontrollera att netloc (domän+port) finns
    if not frontend_parsed.netloc or not backend_parsed.netloc:
        logger.warning(f"Could not extract domain/netloc from URLs: Frontend='{frontend_parsed.netloc}', Backend='{backend_parsed.netloc}'. Cannot set SESSION_COOKIE_DOMAIN.")
        raise ValueError("netloc missing") # Gå till except-blocket

    frontend_domain_parts = frontend_parsed.netloc.split('.')
    backend_domain_parts = backend_parsed.netloc.split('.')

    logger.info(f"DEBUG: Parsed frontend domain parts: {frontend_domain_parts}")
    logger.info(f"DEBUG: Parsed backend domain parts: {backend_domain_parts}")

    # Jämför de två sista delarna (t.ex. ['onrender', 'com'])
    if len(frontend_domain_parts) >= 2 and len(backend_domain_parts) >= 2 and \
       frontend_domain_parts[-2:] == backend_domain_parts[-2:]:
        base_domain = "." + ".".join(frontend_domain_parts[-2:])
        app.config['SESSION_COOKIE_DOMAIN'] = base_domain
        logger.info(f"Setting SESSION_COOKIE_DOMAIN to: {base_domain}")
    else:
        logger.info(f"Frontend ({'.'.join(frontend_domain_parts[-2:])}) and Backend ({'.'.join(backend_domain_parts[-2:])}) TLDs do not match. Not setting SESSION_COOKIE_DOMAIN.")
        # Låt SESSION_COOKIE_DOMAIN vara default (None), binder till exakt backend-domän.
except Exception as parse_err:
    logger.warning(f"Could not parse URLs or parts mismatch, proceeding without setting SESSION_COOKIE_DOMAIN. Error: {parse_err}")

# Logga slutgiltiga cookie-inställningar innan Session initieras
logger.info(
    f"Final cookie settings before Session init: "
    f"Secure={app.config['SESSION_COOKIE_SECURE']}, "
    f"SameSite={app.config['SESSION_COOKIE_SAMESITE']}, "
    f"Path={app.config['SESSION_COOKIE_PATH']}, "
    f"Domain={app.config.get('SESSION_COOKIE_DOMAIN', 'Default (None)')}" # Använd .get() här också
)

# Initiera Flask-Session
if app.config.get('SESSION_REDIS'):
    Session(app)
    logger.info("Flask-Session initialized with Redis backend.")
else:
    logger.error("Flask-Session could not be initialized with Redis due to connection issues.")

# --- CORS Configuration ---
cors_origins = []
frontend_url_from_env = os.getenv('FRONTEND_URL')
if frontend_url_from_env:
    cors_origins.append(frontend_url_from_env)
else:
    logger.warning("FRONTEND_URL environment variable not set, CORS might not allow frontend requests.")
# Lägg alltid till localhost för lokal utveckling
cors_origins.append("http://localhost:3000")

logger.info(f"Configuring CORS for origins: {cors_origins}")

CORS(app,
     supports_credentials=True,
     origins=cors_origins
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
    # Uppdaterat meddelande för att reflektera senaste ändringar
    return jsonify({"message": "Backend API is running! Refactored version with Redis sessions, explicit cookie settings (SameSite=None) and URL debug logging."})

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
        # Sätt ett testvärde i sessionen här för att se om Set-Cookie skickas
        session['user_saved'] = name
        session.modified = True
        logger.info(f"User name saved: {name}. Test session value set.")
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
