# backend/ai.py
"""
Denna modul hanterar AI-integrationen för delegeringsutbildningen.
Använder Flask-Session för att hantera chatthistorik mellan requests.
Konverterar Gemini-historik till serialiserbart format innan lagring.
Innehåller en förbättrad systemprompt för mer dynamiskt och adaptivt beteende.
Hanterar 'start'-meddelande för att explicit starta om sessionen.
"""

import os
import json
import logging
import hashlib
from flask import Blueprint, request, jsonify, send_from_directory, session
from dotenv import load_dotenv
import google.generativeai as genai
import redis

# Importera parsing-funktioner och konstanter
from parsing_utils import parse_ai_response, INTERACTIVE_KEYS

# Ladda miljövariabler
load_dotenv()

# Skapa en Blueprint för API-endpoints
ai_bp = Blueprint('ai', __name__)

# Konfigurera loggning
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Hämta Gemini API-nyckeln från miljön
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY är inte definierat!")
    # raise ValueError("GEMINI_API_KEY is not defined in environment.")

# Förbättrad Systemprompt (Samma som tidigare)
admin_prompt_config = [
    # ... (hela din långa, förbättrade prompt här) ...
     {
        "title": "Grundläggande Roll och Mål",
        "content": "Du är Lexi, en **exceptionellt varm, tålmodig och pedagogisk expertlärare** specialiserad på **delegering inom svensk kommunal vård och omsorg**, specifikt för **Skövde kommun**. Ditt primära mål är att utbilda **vård- och omsorgspersonal (främst undersköterskor)** så att de uppnår den teoretiska kunskap som krävs för att **säkert kunna ta emot delegering av läkemedelshantering** och andra specificerade uppgifter från en sjuksköterska. Du måste **säkerställa verklig förståelse**, inte bara att användaren klickar sig igenom materialet. Använd **emojis sparsamt** för att förstärka din varma och uppmuntrande ton 😊."
    },
    {
        "title": "Anpassning till Användaren",
        "content": "**VIKTIGT:** Anpassa din undervisning dynamiskt!\n"
                   "- **Bakgrund:** Ta hänsyn till användarens angivna bakgrund: `{background}`. Om de är erfarna, bekräfta det och anpassa tempot. Om de är nya, var extra grundlig.\n"
                   "- **Konversationshistorik:** Var **alltid** medveten om vad som sagts tidigare i chatten. Undvik att upprepa information i onödan. Om användaren uttrycker osäkerhet ('jag förstår inte', 'det är svårt'), **erkänn detta** och erbjud dig att förklara på ett annat sätt, ge ett exempel, eller bryta ner det i mindre steg. Fråga vad specifikt som är oklart.\n"
                   "- **Svarsanalys:** Bedöm användarens svar. Korrekta svar på öppna frågor ska berömmas och kopplas till nästa steg. Vid felaktiga svar på slutna frågor, ge feedback och ställ frågan igen (se Feedback-sektion)."
    },
    {
        "title": "Användning av Utbildningsplanen",
        "content": "Du ska följa strukturen och täcka ämnena i den bifogade utbildningsplanen: `{education_plan}`.\n"
                   "**MEN:** Utbildningsplanen är en **disposition/syllabus**, inte en komplett text. Ditt jobb är att **EXPANDERA** på varje punkt. Förklara begrepp, ge **detaljerade beskrivningar**, använd **relevanta exempel från vården i Skövde kommun** (om möjligt), och ställ **fördjupande frågor**. **Kopiera INTE text rakt av från planen.** Följ planens **ordning**."
    },
    {
        "title": "Strikta Formateringsregler för Svar",
        "content": "Detta är **avgörande** för att frontend ska fungera korrekt:\n\n"
                   "1.  **Ren Text (Ingen JSON):** För allmän information, förklaringar, och **öppna frågor** (där användaren ska skriva ett fritt svar), svara **ENDAST** med ren text (använd Markdown för formatering som **fetstil** eller punktlistor). Inkludera **INTE** svaret i ett JSON-objekt. Avsluta öppna frågor med en tydlig uppmaning som: \"Vad tänker du om detta? Skriv ditt svar i rutan nedan.\"\n\n"
                   "2.  **Interaktiva Element (Specifik JSON):** För slutna frågor, scenarier, etc., använd **ENDAST** de **exakta JSON-formaten** nedan, inbäddade i ```json ... ``` block. **VIKTIGT:** När du skickar JSON med alternativ/knappar, avsluta **INTE** texten utanför JSON-blocket med \"Skriv ditt svar i rutan nedan\". Uppmana istället användaren att **välja ett alternativ** eller **klicka på en knapp**.\n\n"
                   "   **JSON-format (Var extremt noggrann!):**\n"
                   "   - **Förslagsknappar (`suggestions`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"suggestions\": {\n"
                   "         \"text\": \"Frågetext här.\",\n"
                   "         \"options\": [\n"
                   "           {\"label\": \"Knapptext 1\", \"value\": \"Värde som skickas vid klick\"},\n"
                   "           {\"label\": \"Knapptext 2\", \"value\": \"Annat värde\"}\n"
                   "         ]\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(Används för enkla frågor, sant/falskt, \"Är du redo?\", etc. `options`-listan måste finnas.)*\n\n"
                   "   - **Scenario (`scenario`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"scenario\": {\n"
                   "         \"title\": \"Scenario Titel\",\n"
                   "         \"description\": \"Beskrivning av situationen... Vad gör du?\",\n"
                   "         \"options\": [\n"
                   "           {\"label\": \"Alternativ A\", \"value\": \"optionA\"},\n"
                   "           {\"label\": \"Alternativ B\", \"value\": \"optionB\"}\n"
                   "         ]\n"
                   "         /* Inkludera INTE 'correctOption' eller 'explanation' här */\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(`title`, `description`, `options` måste finnas.)*\n\n"
                   "   - **Flervalsfråga (`multipleChoice`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"multipleChoice\": {\n"
                   "         \"text\": \"Fråga (välj ett eller flera).\",\n"
                   "         \"options\": [\n"
                   "           {\"id\": \"A\", \"text\": \"Alternativ 1\"},\n"
                   "           {\"id\": \"B\", \"text\": \"Alternativ 2\"}\n"
                   "         ],\n"
                   "         \"multiSelect\": true /* Eller false */\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(`text`, `options`, `multiSelect` måste finnas.)*\n\n"
                   "   - **Matchningsfråga (`matching`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"matching\": {\n"
                   "         \"text\": \"Matcha ihop följande:\",\n"
                   "         \"items\": [\n"
                   "           {\"id\": \"1\", \"text\": \"Begrepp 1\"},\n"
                   "           {\"id\": \"2\", \"text\": \"Begrepp 2\"}\n"
                   "         ],\n"
                   "         \"matches\": [\n"
                   "           {\"id\": \"A\", \"text\": \"Beskrivning A\"},\n"
                   "           {\"id\": \"B\", \"text\": \"Beskrivning B\"}\n"
                   "         ]\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(`text`, `items`, `matches` måste finnas.)*\n\n"
                   "   - **Ordningsfråga (`ordering`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"ordering\": {\n"
                   "         \"text\": \"Placera i rätt ordning:\",\n"
                   "         \"items\": [\n"
                   "           {\"id\": \"1\", \"text\": \"Steg A\"},\n"
                   "           {\"id\": \"2\", \"text\": \"Steg B\"}\n"
                   "         ]\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(`text`, `items` måste finnas.)*\n\n"
                   "   - **Rollspel (`roleplay`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"roleplay\": {\n"
                   "         \"title\": \"Rollspelstitel\",\n"
                   "         \"scenario\": \"Kort beskrivning av situationen.\",\n"
                   "         \"dialogue\": [\n"
                   "           {\"role\": \"Roll 1\", \"message\": \"Repli k1\"},\n"
                   "           {\"role\": \"Roll 2\", \"message\": \"Replik 2\"}\n"
                   "         ],\n"
                   "         \"learningPoints\": [\n"
                   "            \"Lärdom 1\", \"Lärdom 2\"\n"
                   "          ] /* Valfri men bra */\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(`title`, `scenario`, `dialogue` måste finnas)*\n\n"
                   "   - **Feedback (`feedback`):**\n"
                   "     ```json\n"
                   "     {\n"
                   "       \"feedback\": {\n"
                   "         \"type\": \"kunskap\" /* eller \"procedur\", \"sakerhet\", etc. */,\n"
                   "         \"userAnswer\": \"Användarens felaktiga svar (om känt)\",\n"
                   "         \"message\": \"Förklarande feedbacktext.\",\n"
                   "         \"points\": [\n"
                   "           \"Punkt 1\", \"Punkt 2\"\n"
                   "         ],\n"
                   "         \"correctAction\": \"Korrekt agerande/svar.\"\n"
                   "       }\n"
                   "     }\n"
                   "     ```\n"
                   "     *(Används för att ge strukturerad feedback efter fel svar.)*\n\n"
                   "3.  **Inga Andra Format:** Använd **ALDRIG** format som `{ \"response\": \"text...\" }`."
    },
     {
        "title": "Pedagogisk Strategi och Variation",
        "content": "Använd en **varierad pedagogik**.\n"
                   "- **Informationsblock (Ren Text):** Presentera tydlig information från utbildningsplanen (men **utveckla den**). Överväg om en bild passar.\n"
                   "- **Öppna Frågor (Ren Text):** Ställ reflektionsfrågor. Be explicit användaren skriva i rutan.\n"
                   "- **Scenarier (JSON `scenario`):** Använd minst 2-3.\n"
                   "- **Kunskapsfrågor (JSON `suggestions`, `multipleChoice`, etc.):** Variera typerna!\n"
                   "- **Rollspel (JSON `roleplay`):** Använd minst 2-3.\n"
                   "- **Bildanvändning:** `![{imageX description}]({imageX})`. Använd bilderna från listan.\n"
                   "- **Variation:** Blanda metoderna. Inte samma typ flera gånger i rad."
    },
    {
        "title": "Feedback och Interaktion",
        "content": "- **Rätt Svar (Sluten Fråga):** Bekräfta, förstärk, gå vidare.\n"
                   "- **Fel Svar (Sluten Fråga):** Ge feedback (JSON `feedback`), ställ sedan **exakt samma fråga igen** (samma JSON-block).\n"
                   "- **Fritextsvar:** Kommentera meningsfullt, koppla till planen.\n"
                   "- **Uppmaning:** 'Skriv i rutan...' för fritext, 'Välj ett alternativ...' för JSON-frågor."
    },
    {
        "title": "Övriga Instruktioner",
        "content": "- Var konsekvent.\n"
                   "- Var professionell (ingen AI-prat).\n"
                   "- Håll fokus på utbildningen.\n"
                   "- **Avslutning:** Efter hela planen + repetition av felsvar -> sammanfattning."
    },
    {
        "title": "Bildresurser:",
        "content": "Tillgängliga bilder (använd markdown `![beskrivning](nyckel)`):\n"
                   "- `{image1}`: Illustrerar SBAR-kommunikation.\n" # etc...
                   # ... (resten av dina bildbeskrivningar) ...
                   "- `{image14}`: Beskrivning bild 14."

    }
]


# Bildkonfiguration (oförändrad)
BACKEND_BASE_URL = os.getenv('BACKEND_URL', 'http://localhost:10000')
image_assets = {
    "image1": {"url": f"{BACKEND_BASE_URL}/static/images/image1.png", "description": "SBAR-modellen"},
    # ... (resten av dina image_assets) ...
     "image14": { "url": f"{BACKEND_BASE_URL}/static/images/image14.png", "description": "Beskrivning bild 14"},
}

# --- Helper-funktioner (Oförändrade) ---
def get_prompt_hash():
    prompt_json = json.dumps(admin_prompt_config, sort_keys=True)
    return hashlib.md5(prompt_json.encode('utf-8')).hexdigest()

def build_background(user_answers):
    text = "Användarens bakgrund:\n"
    if user_answers.get('underskoterska', 'nej') == 'ja': text += "- Utbildad undersköterska.\n"
    else: text += "- Annan vård- och omsorgspersonal.\n"
    if user_answers.get('delegering', 'nej') == 'ja': text += "- Har tidigare erfarenhet av delegering.\n"
    else: text += "- Ny inom delegering.\n"
    return text

def load_education_plan():
    # ... (samma som förut) ...
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(base_dir, "education_plan.txt")
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Kunde inte läsa utbildningsplanen från {file_path}: {e}")
        return "Utbildningsplan saknas eller kunde inte laddas."


def build_system_instruction(user_answers):
    # ... (samma som förut) ...
    background_text = build_background(user_answers)
    education_plan_text = load_education_plan()
    instruction_parts = []
    for section in admin_prompt_config:
        content = section["content"]
        if "{background}" in content:
            content = content.replace("{background}", background_text)
        if "{education_plan}" in content:
            content = content.replace("{education_plan}", education_plan_text)
        for key, asset in image_assets.items():
            placeholder = "{" + key + "}"
            replacement = asset['url']
            content = content.replace(placeholder, replacement)
        if section["title"]:
            instruction_parts.append(f"### {section['title']}\n{content}")
        else:
            instruction_parts.append(content)
    system_instruction = "\n\n".join(instruction_parts)
    return system_instruction


def build_initial_history(user_answers, user_message, user_name):
    # ... (samma som förut) ...
    greeting = f"Välkommen {user_name} till delegeringsutbildningen!\n"
    greeting += "Jag är din lärare, Lexi. Vi ska tillsammans gå igenom grunderna för **läkemedelstilldelning via delegering** för dig som jobbar inom Skövde kommun.\n\n"
    if user_answers.get('underskoterska', 'nej') == 'ja':
        greeting += "Eftersom du är undersköterska har du redan en viktig roll. Den här utbildningen kompletterar din kompetens.\n"
    if user_answers.get('delegering', 'nej') == 'ja':
        greeting += "Kul att du har tidigare erfarenhet av delegering! Vissa delar kanske är repetition, men vi ser till att allt sitter.\n"
    else:
        greeting += "Om delegering är nytt för dig, ta det lugnt! Vi går igenom allt från grunden.\n"
    greeting += "\nMålet är att du ska känna dig trygg med den teoretiska grunden inför att du möter sjuksköterskan för den praktiska delen.\n\n"
    greeting += "Vi kommer använda chattrutan här nedanför. Ibland får du information, ibland frågor att svara på genom att skriva, och ibland knappar att klicka på. Är du redo att köra igång? 😊 Skriv 'start' när du är redo!"

    history_for_session = [{
        "role": "model",
        "parts": [{"text": greeting}]
    }]
    return greeting, history_for_session


def get_gemini_model(user_answers):
    # ... (samma som förut) ...
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY är inte definierat.")
    genai.configure(api_key=GEMINI_API_KEY)
    system_instruction_text = build_system_instruction(user_answers)
    model = genai.GenerativeModel(
        model_name='gemini-1.5-flash',
        system_instruction=system_instruction_text,
        generation_config={
            "temperature": 0.8, "top_p": 0.95, "top_k": 64,
            "max_output_tokens": 8192, "response_mime_type": "text/plain",
        }
    )
    return model

def convert_gemini_history_to_serializable(gemini_history):
    # ... (samma som förut) ...
    serializable_history = []
    if not gemini_history: return serializable_history
    for turn in gemini_history:
        serializable_parts = []
        if hasattr(turn, 'parts') and turn.parts:
            for part in turn.parts:
                if hasattr(part, 'text') and part.text is not None:
                    serializable_parts.append({'text': part.text})
        if serializable_parts:
             role = getattr(turn, 'role', 'unknown').lower()
             if role in ['user', 'model']:
                 serializable_history.append({'role': role, 'parts': serializable_parts})
             else: logger.warning(f"Skipping history turn with unhandled role '{role}'")
        else: logger.warning(f"Skipping history turn with no serializable parts")
    return serializable_history

# --- Huvud Chat Endpoint ---
@ai_bp.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    user_message = data.get('message', '')
    user_name = data.get('name', 'Användare') # Behövs endast för ny session/hälsning

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    try:
        current_hash = get_prompt_hash()
        chat_session_obj = None

        # *** ÄNDRAD LOGIK: Hantera "start" FÖRST ***
        if user_message.strip().lower() == "start":
            logger.info("Received 'start' message. Clearing session and initializing.")
            session.pop('chat_context', None) # Rensa eventuell gammal session

            # Hämta user_answers från requesten *endast* för 'start'
            user_answers = data.get('answers', {})
            initial_greeting, initial_history_serializable = build_initial_history(user_answers, user_message, user_name)

            # Skapa ny sessionkontext
            chat_context = {
                'user_answers': user_answers,
                'history': initial_history_serializable,
                'hash': current_hash
            }
            session['chat_context'] = chat_context
            session.modified = True
            logger.info("Stored new initial context in session.")

            # Parse greeting och returnera
            parsed_greeting = parse_ai_response(initial_greeting)
            interactive_element = None
            if parsed_greeting.get("interactiveJson") and isinstance(parsed_greeting["interactiveJson"], dict):
                 for key in parsed_greeting["interactiveJson"]:
                     if key in INTERACTIVE_KEYS:
                         interactive_element = {"type": INTERACTIVE_KEYS[key], "data": parsed_greeting["interactiveJson"]}
                         break
            return jsonify({"reply": {"textContent": parsed_greeting["textContent"], "interactiveElement": interactive_element}})

        # *** Om det INTE var "start", fortsätt som tidigare ***
        else:
            chat_context = session.get('chat_context')

            if chat_context and chat_context.get('hash') == current_hash:
                logger.info(f"Existing session context found.")
                retrieved_history = chat_context.get('history', [])
                user_answers = chat_context.get('user_answers', {}) # Hämta sparade svar

                if not retrieved_history:
                    logger.warning("Session context found, but history was empty. Re-initializing (should not happen often).")
                    # Fallback: Skapa helt ny session (liknande start-logiken men utan att returnera direkt)
                    session.pop('chat_context', None)
                    chat_context = None # Markera för att skapa nytt nedan
                else:
                    try:
                        model = get_gemini_model(user_answers)
                        chat_session_obj = model.start_chat(history=retrieved_history)
                        logger.info(f"Recreated chat session from history (length: {len(retrieved_history)}).")
                    except Exception as model_err:
                        logger.error(f"Error recreating Gemini session: {model_err}", exc_info=True)
                        chat_context = None # Nollställ för att skapa nytt nedan

            else: # Ingen session eller hash mismatch
                if not chat_context: logger.info("No session context found. Creating new one.")
                else: logger.info(f"Prompt hash changed. Creating new session.")
                session.pop('chat_context', None)
                chat_context = None # Markera för att skapa nytt nedan

            # Skapa ny session om ingen giltig hittades/återskapades
            if chat_context is None:
                logger.info("Initializing new chat session (outside of 'start').")
                # Om vi hamnar här utanför 'start' (t.ex. första anropet efter /api/user, eller hash-ändring)
                # behöver vi skapa initial kontext, men sen fortsätta med nuvarande meddelande.
                current_user_answers = data.get('answers', {}) # Hämta från request om det är första anropet
                _ , initial_history = build_initial_history(current_user_answers, "dummy", user_name) # Bygg historik men ignorera hälsning
                chat_context = {
                    'user_answers': current_user_answers,
                    'history': initial_history, # Börja med bara hälsningen från AI
                    'hash': current_hash
                }
                try:
                    model = get_gemini_model(current_user_answers)
                    chat_session_obj = model.start_chat(history=initial_history) # Starta med bara hälsningen
                    session['chat_context'] = chat_context # Spara den nya kontexten
                    session.modified = True
                    logger.info("Stored new context for ongoing session.")
                except Exception as model_err:
                     logger.error(f"Error starting new ongoing session: {model_err}", exc_info=True)
                     return jsonify({"reply": {"textContent": "Kunde inte initiera chattsessionen.", "interactiveElement": None}}), 500

            # --- Generera AI-svar ---
            if not chat_session_obj:
                 logger.error("Chat session object is unexpectedly None.")
                 return jsonify({"reply": {"textContent": "Ett oväntat sessionsfel inträffade.", "interactiveElement": None}}), 500

            logger.info(f"Sending message to Gemini: '{user_message[:50]}...'")
            response = chat_session_obj.send_message(content=user_message)

            # Extrahera AI-svar (oförändrat)
            ai_reply_raw = ""
            try:
                if hasattr(response, 'text') and response.text is not None: ai_reply_raw = response.text
                elif hasattr(response, 'parts') and response.parts:
                     text_parts = [part.text for part in response.parts if hasattr(part, 'text') and part.text]
                     ai_reply_raw = "\n".join(text_parts).strip()
                else:
                     logger.warning(f"Unexpected response structure from Gemini: {response}")
                     ai_reply_raw = "Kunde inte generera ett svar just nu."
                if not ai_reply_raw: ai_reply_raw = ""
            except Exception as extract_err:
                 logger.error(f"Error extracting text from Gemini response: {extract_err}")
                 ai_reply_raw = "Ett internt fel uppstod vid bearbetning av svaret."

            logger.info(f"Received raw reply from Gemini: '{ai_reply_raw[:100]}...'")

            # --- Uppdatera historiken i sessionen ---
            updated_history_gemini = chat_session_obj.history
            serializable_history = convert_gemini_history_to_serializable(updated_history_gemini)
            session['chat_context']['history'] = serializable_history
            session.modified = True
            logger.info(f"Updated session history (length: {len(serializable_history)}). Context saved.")

            # --- Parsa och returnera svar ---
            parsed_response = parse_ai_response(ai_reply_raw)
            # ... (resten av parse/response-logiken oförändrad) ...
            logger.info(f"Parsed response. Text: '{parsed_response['textContent'][:100]}...', JSON found: {parsed_response['interactiveJson'] is not None}")

            interactive_element_response = None
            if parsed_response["interactiveJson"]:
                interactive_type = None
                if isinstance(parsed_response["interactiveJson"], dict):
                    for key in parsed_response["interactiveJson"]:
                        if key in INTERACTIVE_KEYS:
                            interactive_type = INTERACTIVE_KEYS[key]
                            break
                elif parsed_response["interactiveJson"] is not None:
                     logger.warning(f"Found JSON block, but it was not a dictionary: {type(parsed_response['interactiveJson'])}")

                if interactive_type:
                    interactive_element_response = {"type": interactive_type,"data": parsed_response["interactiveJson"]}
                elif parsed_response["interactiveJson"] is not None:
                    logger.warning(f"Parsed JSON did not contain a known interactive key: {list(parsed_response['interactiveJson'].keys()) if isinstance(parsed_response['interactiveJson'], dict) else 'N/A'}")

            final_response = {
                "reply": {
                    "textContent": parsed_response["textContent"],
                    "interactiveElement": interactive_element_response
                }
            }
            return jsonify(final_response)

    # --- Felhantering (Generell) ---
    except ValueError as ve: # T.ex. saknad API-nyckel
        logger.error(f"Configuration error: {ve}")
        return jsonify({"reply": {"textContent": "Ett konfigurationsfel inträffade.", "interactiveElement": None}}), 500
    except redis.exceptions.ConnectionError as redis_err:
         logger.error(f"Redis connection error: {redis_err}", exc_info=True)
         session.pop('chat_context', None)
         return jsonify({"reply": {"textContent": "Problem med anslutning till sessionen. Försök igen.", "interactiveElement": None}}), 503
    except Exception as e:
        logger.error(f"Error during chat processing: {e}", exc_info=True)
        return jsonify({"reply": {"textContent": "Ursäkta, ett oväntat problem uppstod.", "interactiveElement": None}}), 500


# Lokal körning (oförändrad)
if __name__ == '__main__':
    # ... (samma lokala körningskod som i förra svaret) ...
     from flask import Flask
     from flask_cors import CORS
     from flask_session import Session
     import redis

     app = Flask(__name__)

     # --- Local Dev Session Config ---
     app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'local-dev-secret')
     local_redis_url = os.getenv('REDIS_URL')
     session_config_type = 'filesystem' # Default
     if local_redis_url:
         try:
             app.config['SESSION_TYPE'] = 'redis'
             app.config['SESSION_REDIS'] = redis.from_url(local_redis_url)
             app.config['SESSION_REDIS'].ping() # Test connection
             session_config_type = 'redis'
             print("--- LOCAL DEV: Using REDIS sessions ---")
         except Exception as local_redis_err:
             print(f"--- LOCAL DEV: Failed to connect to Redis ({local_redis_url}), using filesystem sessions: {local_redis_err} ---")
             app.config['SESSION_TYPE'] = 'filesystem'
     else:
         print("--- LOCAL DEV: REDIS_URL not set, using filesystem sessions ---")
         app.config['SESSION_TYPE'] = 'filesystem'

     if app.config['SESSION_TYPE'] == 'filesystem':
          app.config['SESSION_FILE_DIR'] = './.flask_session/'
          if not os.path.exists('./.flask_session'):
              os.makedirs('./.flask_session')

     app.config['SESSION_COOKIE_SECURE'] = False
     app.config['SESSION_COOKIE_HTTPONLY'] = True
     app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
     app.config['SESSION_COOKIE_PATH'] = '/'
     app.config['SESSION_COOKIE_DOMAIN'] = None

     Session(app)
     # --------------------------------

     CORS(app, supports_credentials=True, origins=["http://localhost:3000"])
     app.register_blueprint(ai_bp)

     @app.route('/static/<path:path>')
     def serve_static_local(path):
         static_dir = os.path.join(os.path.dirname(__file__), 'static')
         return send_from_directory(static_dir, path)

     port = int(os.environ.get('PORT', 10000))
     static_images_dir_local = os.path.join(os.path.dirname(__file__), 'static', 'images')
     if not os.path.exists(static_images_dir_local):
          os.makedirs(static_images_dir_local, exist_ok=True)

     print(f"Starting development server on http://localhost:{port}")
     app.run(host='0.0.0.0', port=port, debug=True, threaded=False, processes=1)
