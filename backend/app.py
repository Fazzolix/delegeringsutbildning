# backend/app.py
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
from ai import ai_bp   # Your AI module with refactored chat endpoint
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

# Configure CORS to allow requests from frontend
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
# Allow requests from Render preview environments as well if applicable
# preview_url_pattern = r"https://your-app-pr-\d+\.onrender\.com" # Example pattern
cors_origins = [frontend_url, "http://localhost:3000"]
# Add preview URL pattern if needed (requires regex support in CORS or specific URLs)

CORS(app, resources={
    r"/api/*": {"origins": cors_origins},
    # Allow static files from anywhere, but could restrict to cors_origins if needed
    r"/static/*": {"origins": "*"}
})


# Define an absolute path to the database
db_path = os.path.join(basedir, 'database.db')

# Register AI blueprint
app.register_blueprint(ai_bp)

# TTS-funktionalitet är borttagen
# Ingen import eller registrering av tts_bp eller dummy_tts_bp

# Initialize the database: Create the "users" table if it doesn't exist
def init_db():
    try:
        with sqlite3.connect(db_path) as conn:
            c = conn.cursor()
            # Use IF NOT EXISTS to avoid errors on subsequent runs
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
# This explicit route matches the URL structure used in ai.py
@app.route('/static/<path:filename>')
def serve_static_files(filename):
    # Use the static_folder path defined in the Flask constructor
    static_dir = app.static_folder
    logger.info(f"Attempting to serve static file: {filename} from {static_dir}")
    try:
        # Ensure the requested path is safe and within the static folder
        # send_from_directory handles security checks like preventing path traversal
        return send_from_directory(static_dir, filename)
    except FileNotFoundError:
         logger.warning(f"Static file not found: {os.path.join(static_dir, filename)}")
         return jsonify({"error": "File not found"}), 404
    except Exception as e:
        logger.error(f"Error serving static file {filename}: {e}")
        return jsonify({"error": "Could not serve file"}), 500


@app.route('/')
def index():
    return jsonify({"message": "Backend API is running! Refactored version."})

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
            # Simple insertion, consider adding checks for existing users if needed
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
    # Ensure static directory exists (especially important for local dev)
    static_images_dir = os.path.join(basedir, 'static', 'images')
    if not os.path.exists(static_images_dir):
         os.makedirs(static_images_dir, exist_ok=True)
         logger.info(f"Created directory: {static_images_dir}")

    # Use PORT environment variable for Render or 10000 as default
    port = int(os.environ.get('PORT', 10000))
    # Check FLASK_DEBUG env variable (set to 'True' or '1' for debug mode)
    is_debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1')
    logger.info(f"Starting Flask server on host 0.0.0.0, port {port}, Debug: {is_debug}")
    app.run(host='0.0.0.0', port=port, debug=is_debug)
