# backend/parsing_utils.py
import json
import re
import logging

logger = logging.getLogger(__name__)

# Förbättrad regex för att fånga JSON inuti ```json ... ``` block
# Gör den mer flexibel för whitespace och fångar innehållet.
# Fångar {..} eller [..]
JSON_BLOCK_REGEX = re.compile(r"```json\s*([\{\[].*?[\]\}])\s*```", re.DOTALL | re.IGNORECASE)

# Kända nycklar som indikerar ett interaktivt element
INTERACTIVE_KEYS = {
    "suggestions": "suggestions", # För enkla svarsförslag
    "scenario": "scenario",
    "multipleChoice": "multipleChoice",
    "matching": "matching",
    "ordering": "ordering",
    "roleplay": "roleplay",
    "feedback": "feedback" # Även feedback kan vara interaktivt
    # Lägg till fler nycklar här om AI:n kan generera andra typer
}

def parse_ai_response(raw_text: str) -> dict:
    """
    Parar AI:ns råa textsvar för att extrahera textinnehåll och eventuella
    interaktiva JSON-element.

    Args:
        raw_text: Det råa svaret från AI (Gemini).

    Returns:
        En dictionary: {"textContent": str, "interactiveJson": dict | None}
        där interactiveJson är det fullständiga parsade JSON-objektet om det
        innehåller en känd interaktiv nyckel, annars None.
    """
    text_content = raw_text
    interactive_json_data = None
    json_parsing_successful = False

    # Försök hitta ett JSON-block
    match = JSON_BLOCK_REGEX.search(raw_text)
    if match:
        json_string = match.group(1).strip()
        # Ta bort JSON-blocket (och omgivande ```json```) från texten
        text_content = JSON_BLOCK_REGEX.sub("", raw_text).strip()
        logger.info(f"Found potential JSON block. Raw string: '{json_string[:100]}...'")
        try:
            # Försök parsa JSON
            parsed_data = json.loads(json_string)

            # Kontrollera om det parsade objektet (om det är en dict) innehåller en känd interaktiv nyckel
            is_interactive = False
            if isinstance(parsed_data, dict):
                for key in INTERACTIVE_KEYS:
                    if key in parsed_data:
                        is_interactive = True
                        logger.info(f"Recognized interactive key '{key}' in JSON.")
                        break # Found an interactive key, no need to check further

            if is_interactive:
                interactive_json_data = parsed_data # Behåll hela det ursprungliga JSON-objektet
                json_parsing_successful = True
                logger.info(f"Successfully parsed interactive JSON block.")
            else:
                 logger.warning(f"Parsed JSON block but did not recognize key as interactive: {parsed_data}")
                 # Lägg tillbaka JSON som text om det inte var interaktivt? Nej, behåll texten utanför.
                 # text_content = raw_text # Återställ till originaltext om JSON inte var interaktiv? Nej.

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON block: {e}. Raw block: '{json_string[:100]}...'")
            # JSON hittades men kunde inte parsas, behåll den som text i svaret.
            text_content = raw_text # Återställ texten till originalet om parse misslyckades

    # Om inget JSON-block hittades, kolla om *hela* svaret är en JSON-sträng (fallback)
    if not match:
         try:
            # Ta bort eventuella ``` som kan omsluta hela svaret
            potential_json_string = raw_text.strip()
            if potential_json_string.startswith("```") and potential_json_string.endswith("```"):
                 potential_json_string = potential_json_string[3:-3].strip()

            parsed_data = json.loads(potential_json_string)

            is_interactive = False
            if isinstance(parsed_data, dict):
                 for key in INTERACTIVE_KEYS:
                     if key in parsed_data:
                         is_interactive = True
                         logger.info(f"Recognized interactive key '{key}' in raw text JSON.")
                         break

            if is_interactive:
                interactive_json_data = parsed_data
                json_parsing_successful = True
                # Om hela svaret var JSON, försök extrahera text från den
                extracted_text = ""
                if isinstance(parsed_data, dict):
                    # Prioriteringsordning för textkälla inuti JSON
                    if 'text' in parsed_data and isinstance(parsed_data['text'], str):
                        extracted_text = parsed_data['text']
                    elif 'title' in parsed_data and isinstance(parsed_data['title'], str):
                         extracted_text = parsed_data['title']
                    elif 'description' in parsed_data and isinstance(parsed_data['description'], str):
                         extracted_text = parsed_data['description']
                text_content = extracted_text # Ersätt text_content med text från JSON
                logger.info(f"Successfully parsed raw text as interactive JSON. Using extracted text: '{text_content[:50]}...'")
            else:
                 logger.warning(f"Parsed raw text as JSON but did not recognize key as interactive: {parsed_data}")
                 # Behandla det inte som interaktivt, text_content är redan raw_text.

         except json.JSONDecodeError:
            # Det var inte en JSON-sträng, så text_content är korrekt som den är (hela raw_text).
            pass

    # Om vi lyckades parsa interaktiv JSON och texten utanför är tom,
    # försök extrahera en textkälla från JSON igen som fallback.
    if json_parsing_successful and not text_content.strip() and isinstance(interactive_json_data, dict):
        extracted_text = ""
        if 'text' in interactive_json_data and isinstance(interactive_json_data['text'], str):
            extracted_text = interactive_json_data['text']
        elif 'title' in interactive_json_data and isinstance(interactive_json_data['title'], str):
            extracted_text = interactive_json_data['title']
        elif 'description' in interactive_json_data and isinstance(interactive_json_data['description'], str):
            extracted_text = interactive_json_data['description'] # För scenarier
        if extracted_text:
            text_content = extracted_text
            logger.info(f"JSON found, outer text empty. Using extracted JSON text as textContent: '{text_content[:50]}...'")


    # Säkerställ att text_content alltid är en sträng
    if not isinstance(text_content, str):
         text_content = str(text_content).strip() # Fallback om något konstigt hände

    return {
        "textContent": text_content,
        "interactiveJson": interactive_json_data if json_parsing_successful else None
    }
