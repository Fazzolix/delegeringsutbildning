import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
from ai import ai_bp   # Your existing AI module
from tts import tts_bp # Your TTS module
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__)

# Configure CORS to allow requests from frontend
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
CORS(app, resources={r"/api/*": {"origins": [frontend_url, "http://localhost:3000"]}})

# Define an absolute path to the database
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'database.db')

# Register blueprints
app.register_blueprint(ai_bp)
app.register_blueprint(tts_bp)

# Initialize the database: Create the "users" table if it doesn't exist
def init_db():
    with sqlite3.connect(db_path) as conn:
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        ''')
        conn.commit()

init_db()

# Serve static files
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/')
def index():
    return jsonify({"message": "Backend API is running!"})

# API endpoint to save the user's name
@app.route('/api/user', methods=['POST'])
def save_user():
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name must be provided'}), 400

    with sqlite3.connect(db_path) as conn:
        c = conn.cursor()
        c.execute('INSERT INTO users (name) VALUES (?)', (name,))
        conn.commit()

    return jsonify({'message': 'Name saved successfully!'})

if __name__ == '__main__':
    # Använd PORT miljövariabeln för Render eller 10000 som standard
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=True)
