import os
import logging
from flask import Blueprint, request, Response, jsonify
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv
load_dotenv()

tts_bp = Blueprint('tts', __name__)

@tts_bp.route('/api/tts-stream', methods=['GET'])
def tts_stream():
    # Hämta texten som ska läsas upp från query-parametern
    text = request.args.get("text")
    if not text:
        return jsonify({"error": "Ingen text angiven"}), 400

    # Kolla om användaren skickar med en "rate"-parameter för talhastighet
    rate = request.args.get("rate")
    if rate:
        try:
            rate_value = float(rate)
            # Omslut texten med SSML för att justera talhastigheten
            text = f'<speak><prosody rate="{rate_value}%">{text}</prosody></speak>'
        except ValueError:
            logging.warning("Ogiltigt värde för rate, ignorerar inställningen.")

    # Hämta API-nyckeln från din .env-fil
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        logging.error("ELEVENLABS_API_KEY saknas i miljön.")
        return jsonify({"error": "API-nyckel saknas"}), 500

    # Skapa en klientinstans för ElevenLabs
    client = ElevenLabs(api_key=api_key)

    try:
        # Anropa ElevenLabs streaming-funktion med extra voice_settings:
        audio_stream = client.text_to_speech.convert_as_stream(
            text=text,
            voice_id="4xkUqaR9MYOJHoaC1Nak",
            model_id="eleven_turbo_v2_5",  # Använd den förbättrade modellen "Eleven Flash v2.5"
            output_format="mp3_44100_128",
            voice_settings={
                "stability": 0.3,         # 30 %
                "similarity_boost": 0.66    # 66 %
            }
        )
    except Exception as e:
        logging.error("Fel vid anrop till ElevenLabs streaming API: %s", e)
        return jsonify({"error": "Kunde inte generera TTS-stream"}), 500

    # Returnera det chunkade MP3-flödet med rätt mimetype
    def generate():
        for chunk in audio_stream:
            if isinstance(chunk, bytes):
                yield chunk

    return Response(generate(), mimetype="audio/mpeg")
