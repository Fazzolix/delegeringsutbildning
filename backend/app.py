import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from ai import ai_bp   # Din befintliga AI-modul
from tts import tts_bp # Vår nya TTS-modul

app = Flask(__name__)
CORS(app)

# Definiera en absolut sökväg till databasen
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'database.db')

# Registrera blueprints
app.register_blueprint(ai_bp)
app.register_blueprint(tts_bp)

# Initiera databasen: Skapa tabellen "users" om den inte redan finns
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

@app.route('/')
def index():
    return jsonify({"message": "Hello, world!"})

# API-endpoint för att spara användarens namn
@app.route('/api/user', methods=['POST'])
def save_user():
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Namn måste anges'}), 400

    with sqlite3.connect(db_path) as conn:
        c = conn.cursor()
        c.execute('INSERT INTO users (name) VALUES (?)', (name,))
        conn.commit()

    return jsonify({'message': 'Namnet sparades!'})

if __name__ == '__main__':
    app.run(debug=True)
