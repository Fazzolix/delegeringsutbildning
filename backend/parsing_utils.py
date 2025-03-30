# backend/parsing_utils.py
import json
import re
import logging

logger = logging.getLogger(__name__)

# Förbättrad regex för att fånga JSON inuti ```json ... ``` block
# Gör den mer flexibel för whitespace och fångar innehållet.
JSON_BLOCK_REGEX = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)

# Kända nycklar som indikerar ett interaktivt element och deras typnamn
INTERACTIVE_KEYS = {
    "suggestions": "suggestions", # För enkla svarsförslag
    "scenario": "scenario",
    "multipleChoice": "multipleChoice",
    "matching": "matching",
    "ordering": "ordering",
    "roleplay": "roleplay",
    "feedback": "feedback" # Även feedback kan vara interaktivt om det presenterar alternativ igen
    # Lägg till fler nycklar här om AI:n kan generera andra typer
}

def parse_ai_response(raw_text: str) -> tuple[str, dict | None]:
    """
    Parar AI:ns råa textsvar för att extrahera textinnehåll och eventuella
    interaktiva JSON-element.

    Args:
        raw_text: Det råa svaret från AI (Gemini).

    Returns:
        En tuple: (text_content: str, interactive_element: dict | None)
        där interactive_element har formatet:
        { "type": "...", "data": { ... } } eller None om ingen giltig JSON hittas.
    """
    text_content = raw_text
    interactive_element = None
    json_data = None
    json_type = None

    # Försök hitta ett JSON-block
    match = JSON_BLOCK_REGEX.search(raw_text)
    if match:
        json_string = match.group(1)
        # Ta bort JSON-blocket (och omgivande ```json```) från texten
        text_content = JSON_BLOCK_REGEX.sub("", raw_text).strip()
        logger.info(f"Found potential JSON block: {json_string}")
        try:
            # Försök parsa JSON
            parsed_data = json.loads(json_string)
            json_data = parsed_data # Behåll hela det ursprungliga JSON-objektet

            # Identifiera typen baserat på den första matchande kända nyckeln
            found_type = None
            if isinstance(json_data, dict):
                for key in INTERACTIVE_KEYS:
                    if key in json_data:
                        found_type = INTERACTIVE_KEYS[key]
                        # Om nyckeln är den enda i objektet, använd dess innehåll som data
                        if len(json_data) == 1:
                            json_data = json_data[key]
                        # Annars, behåll hela objektet som data (t.ex. för 'suggestions' som har 'text' bredvid)
                        break # Ta första matchningen

            if found_type:
                json_type = found_type
                logger.info(f"Successfully parsed JSON. Type: {json_type}, Data: {json_data}")
            else:
                 logger.warning(f"Parsed JSON but did not recognize key as interactive element: {json_data}")
                 # Lägg tillbaka den oigenkända JSON:en som text? Eller ignorera?
                 # För nu ignorerar vi den som interaktiv och behåller texten som den är.
                 # Alternativt: text_content = raw_text # Återställ om JSON inte var interaktiv

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON block: {e}. Raw block: {json_string}")
            # JSON hittades men kunde inte parsas, behåll den som text i svaret?
            # text_content = raw_text # Återställ texten till originalet
            pass # Ignorera felet och returnera ingen interaktiv del

    # Försök parsa om det *inte* finns ```json``` block men texten *är* en JSON-sträng
    # Detta är en fallback, men instruktionerna säger att JSON ska vara i block.
    if not match:
         try:
            # Ta bort eventuella ``` som kan omsluta hela svaret
            potential_json_string = raw_text.strip()
            if potential_json_string.startswith("```") and potential_json_string.endswith("```"):
                 potential_json_string = potential_json_string[3:-3].strip()

            parsed_data = json.loads(potential_json_string)
            json_data = parsed_data
            found_type = None
            if isinstance(json_data, dict):
                for key in INTERACTIVE_KEYS:
                     if key in json_data:
                        found_type = INTERACTIVE_KEYS[key]
                        if len(json_data) == 1:
                             json_data = json_data[key]
                        break

            if found_type:
                json_type = found_type
                # Om vi lyckades parsa hela svaret som JSON, finns det ingen text kvar
                text_content = "" # Eller kanske en standardtext? "Välj ett alternativ:"
                # Om det fanns en "text"-nyckel i JSON:en kan den användas som textContent?
                if isinstance(json_data, dict) and 'text' in json_data and isinstance(json_data['text'], str):
                     text_content = json_data['text']
                     # Ta bort 'text' från datan som skickas till komponenten? Beror på komponentens behov.
                     # json_data.pop('text', None) # Om komponenten inte ska få texten igen

                logger.info(f"Successfully parsed raw text as JSON. Type: {json_type}, Data: {json_data}")
            # Om ingen känd nyckel hittas, behandla det inte som interaktivt.

         except json.JSONDecodeError:
            # Det var inte en JSON-sträng, så text_content är korrekt som den är.
            pass

    # Konstruera det interaktiva elementet om typ och data finns
    if json_type and json_data is not None:
        interactive_element = {
            "type": json_type,
            "data": json_data  # Skicka hela det ursprungliga (eventuellt modifierade) JSON-objektet
        }

    # Säkerställ att text_content alltid är en sträng
    if not isinstance(text_content, str):
         text_content = str(text_content) # Fallback om något konstigt hände

    # Om texten blev tom men det finns ett interaktivt element,
    # försök extrahera en 'text' eller 'title' från datan som textContent.
    if not text_content.strip() and interactive_element and isinstance(interactive_element.get("data"), dict):
        data_dict = interactive_element["data"]
        if "text" in data_dict and isinstance(data_dict["text"], str):
             text_content = data_dict["text"]
        elif "title" in data_dict and isinstance(data_dict["title"], str):
             text_content = data_dict["title"]
        elif "description" in data_dict and isinstance(data_dict["description"], str):
            text_content = data_dict["description"] # För scenarier

    return text_content.strip(), interactive_element
