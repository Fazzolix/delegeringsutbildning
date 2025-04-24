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
# urllib.parse behövs inte längre för domain-logik
# from urllib.parse import urlparse

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
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
if not app.config['SECRET_KEY']:
    logger.error("FATAL: SECRET_KEY environment variable is not set!")
    app.config['SECRET_KEY'] = 'unsafe-dev-key-replace-me-immediately'
    logger.warning("!!! Using UNSAFE fallback SECRET_KEY. Set a proper environment variable! !!!")

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

# *** Cookie-konfiguration UTAN explicit Domain ***
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_PATH'] = '/'
# Ingen app.config['SESSION_COOKIE_DOMAIN'] här, låt den vara default (None)

# Logga slutgiltiga cookie-inställningar
logger.info(
    f"Final cookie settings before Session init: "
    f"Secure={app.config.get('SESSION_COOKIE_SECURE')}, "
    f"SameSite={app.config.get('SESSION_COOKIE_SAMESITE')}, "
    f"Path={app.config.get('SESSION_COOKIE_PATH')}, "
    f"Domain={app.config.get('SESSION_COOKIE_DOMAIN', 'Default (None)')}" # Bör nu logga Default (None)
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
cors_origins.append("http://localhost:3000")

logger.info(f"Configuring CORS for origins: {cors_origins}")
CORS(app, supports_credentials=True, origins=cors_origins)
# -------------------------


# ----- Resten av app.py (databaskod, routes, etc.) är oförändrad -----

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
    except sqlite3.Error as e:
        logger.error(f"Database error during initialization: {e}")

init_db()

# Serve static files
@app.route('/static/<path:filename>')
def serve_static_files(filename):
    static_dir = app.static_folder
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
    return jsonify({"message": "Backend API running - attempting default cookie domain."})

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
