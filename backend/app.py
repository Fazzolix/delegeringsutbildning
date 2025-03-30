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

app = Flask(__name__, static_folder='static') # Explicitly define static folder

# Configure CORS to allow requests from frontend
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
# Allow requests from Render preview environments as well if applicable
# preview_url_pattern = r"https://your-app-pr-\d+\.onrender\.com" # Example pattern
CORS(app, resources={
    r"/api/*": {"origins": [frontend_url, "http://localhost:3000"]}, # Add more origins if needed
    r"/static/*": {"origins": "*"} # Allow static files from anywhere (adjust if needed)
})


# Define an absolute path to the database
basedir = os.path.abspath(os.path.dirname(__file__))
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
# Ensure this route doesn't conflict with other blueprints or routes
# Flask automatically serves files from the 'static_folder' defined above at the /static URL prefix.
# Explicitly defining the route can sometimes be needed for specific configurations or blueprints.
# Let's keep the explicit route for clarity, matching the image URLs in ai.py
@app.route('/static/<path:filename>')
def serve_static_files(filename):
     # Construct the absolute path to the static directory
    static_dir = os.path.join(basedir, 'static')
    logger.info(f"Attempting to serve static file: {filename} from {static_dir}")
    # Check if the file exists to prevent errors
    file_path = os.path.join(static_dir, filename)
    if not os.path.exists(file_path):
        logger.warning(f"Static file not found: {file_path}")
        return jsonify({"error": "File not found"}), 404
    try:
        return send_from_directory(static_dir, filename)
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
    logger.info(f"Starting Flask server on host 0.0.0.0, port {port}")
    # debug=False is generally recommended for production/Render deployments
    # Set debug=True for local development if needed, but be cautious
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG', 'False') == 'True')
