# backend/app.py
import os
from flask import Flask, jsonify, request, send_from_directory, session # Importera session
from flask_cors import CORS
from flask_session import Session # Importera Flask-Session
import redis # Importera redis
import sqlite3
from ai import ai_bp
from dotenv import load_dotenv
import logging

# Konfigurera loggning
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Ladda miljövariabler
load_dotenv()

# Define an absolute path to the base directory of the backend
basedir = os.path.abspath(os.path.dirname(__file__))

# Initialize Flask app, explicitly setting the static folder relative to basedir
app = Flask(__name__, static_folder=os.path.join(basedir, 'static'))

# --- Flask-Session Configuration ---
# VIKTIGT: Sätt en stark, hemlig nyckel i din miljö (.env och Render)!
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'fallback-secret-key-change-me!')
if app.config['SECRET_KEY'] == 'fallback-secret-key-change-me!':
    logger.warning("Using fallback SECRET_KEY. Please set a strong SECRET_KEY environment variable.")

app.config['SESSION_TYPE'] = 'redis' # Använd Redis som backend
redis_url = os.getenv('REDIS_URL')
if not redis_url:
    logger.error("REDIS_URL is not set. Cannot configure Flask-Session with Redis.")
    # Fallback eller exit? För nu sätter vi None, Flask-Session kommer klaga.
    app.config['SESSION_REDIS'] = None
else:
    try:
        # Skapa en Redis-klientinstans från URL:en
        # decode_responses=True är ofta bra, men Gemini historik kan innehålla komplexa objekt,
        # så vi låter Flask-Session hantera serialisering/deserialisering.
        # OBS: Kontrollera att redis-py versionen stödjer from_url med ssl_cert_reqs=None om du använder rediss://
        # För Render's interna Redis behövs oftast inte SSL.
        redis_client = redis.from_url(redis_url, decode_responses=False) # Behåll bytes för Flask-Session
        redis_client.ping() # Testa anslutningen
        app.config['SESSION_REDIS'] = redis_client
        logger.info(f"Successfully connected to Redis at {redis_url.split('@')[-1]}") # Logga utan creds
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Failed to connect to Redis at {redis_url.split('@')[-1]}: {e}")
        app.config['SESSION_REDIS'] = None # Sätt till None om anslutningen misslyckas
    except Exception as e:
        logger.error(f"Error creating Redis client: {e}")
        app.config['SESSION_REDIS'] = None

# Ställ in sessionscookie-parametrar (valfritt men rekommenderat)
app.config['SESSION_COOKIE_SECURE'] = True # Skicka bara cookie över HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True # Gör cookien oåtkomlig för JavaScript
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' # Skydd mot CSRF

# Initiera Flask-Session
if app.config['SESSION_REDIS']:
    Session(app)
    logger.info("Flask-Session initialized with Redis backend.")
else:
    logger.error("Flask-Session could not be initialized with Redis due to connection issues.")
    # Överväg att stoppa appen här eller falla tillbaka till filsystem (mindre robust)
    # app.config['SESSION_TYPE'] = 'filesystem'
    # Session(app)
    # logger.warning("Falling back to filesystem sessions (less robust).")
# ------------------------------------

# Configure CORS to allow requests from frontend
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
cors_origins = [frontend_url, "http://localhost:3000"]

CORS(app, supports_credentials=True, resources={ # Viktigt: supports_credentials=True för session cookies
    r"/api/*": {"origins": cors_origins},
    r"/static/*": {"origins": "*"}
})

# Define an absolute path to the database
db_path = os.path.join(basedir, 'database.db')

# Register AI blueprint
app.register_blueprint(ai_bp)

# Initialize the database: Create the "users" table if it doesn't exist
def init_db():
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            c.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL
                )
            ''')
            conn.commit()
        logger.info("Database initialized successfully.")
    except sqlite3.Error as e:
        logger.error(f"Database error during initialization: {e}")

init_db()

# Serve static files (images)
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
    return jsonify({"message": "Backend API is running! Refactored version with Redis sessions."})

# API endpoint to save the user's name
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
    # När du kör lokalt med `python app.py`, körs bara en process, så sessioner fungerar även utan Redis.
    # Men det är bra att testa med Redis lokalt också om möjligt.
    app.run(host='0.0.0.0', port=port, debug=is_debug)
