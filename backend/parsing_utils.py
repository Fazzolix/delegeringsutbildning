# backend/parsing_utils.py
import json
import re
import logging

logger = logging.getLogger(__name__)

# Define known top-level keys for interactive JSON structures based on ai.py prompt
# These help differentiate our interactive JSON from other potential JSON in the text.
INTERACTIVE_JSON_KEYS = {
    "text", "suggestions", "scenario", "roleplay", "multipleChoice",
    "matching", "ordering", "feedback", "media", "exercise"
}

def parse_ai_response(raw_text: str) -> dict:
    """
    Parses the raw text response from the AI (Gemini).

    Identifies and extracts known interactive JSON structures, separating them
    from the conversational text content.

    Args:
        raw_text: The raw string response from the AI.

    Returns:
        A dictionary containing separated text and JSON data:
        {
            "textContent": "The conversational text part...",
            "interactiveJson": { ... } | None  # The extracted interactive JSON object or None
        }
    """
    if not raw_text or not isinstance(raw_text, str):
        return {"textContent": "", "interactiveJson": None}

    raw_text = raw_text.strip()
    extracted_json = None
    text_content = raw_text
    json_string = None

    # --- Strategy 1: Look for JSON within ```json ... ``` blocks ---
    json_block_match = re.search(r"```json\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    if json_block_match:
        json_string = json_block_match.group(1).strip()
        try:
            potential_json = json.loads(json_string)
            if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                extracted_json = potential_json
                # Extract text before and after the block
                start_index = json_block_match.start()
                end_index = json_block_match.end()
                pre_text = raw_text[:start_index].strip()
                post_text = raw_text[end_index:].strip()
                text_content = f"{pre_text}\n\n{post_text}".strip()
                logger.info("Successfully parsed JSON from ```json block.")
            else:
                logger.warning("JSON found in block, but didn't match known interactive keys.")
                json_string = None # Reset json_string if it's not our format
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to decode JSON from ```json block: {e}. Content: {json_string[:100]}...")
            json_string = None # Reset on error

    # --- Strategy 2: Look for JSON object starting at the beginning or end ---
    if not extracted_json:
        # Check if the entire string is a JSON object
        if raw_text.startswith('{') and raw_text.endswith('}'):
            try:
                potential_json = json.loads(raw_text)
                if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                    extracted_json = potential_json
                    text_content = "" # Assume no surrounding text if the whole string is JSON
                    json_string = raw_text
                    logger.info("Successfully parsed JSON object matching the entire string.")
                else:
                     logger.warning("String is JSON, but didn't match known interactive keys.")
            except json.JSONDecodeError:
                # It wasn't valid JSON, proceed as plain text.
                pass # Keep raw_text as text_content

        # Check if JSON is at the very beginning or very end (more precise)
        # This regex finds the first valid JSON object starting at index 0 OR
        # the last valid JSON object ending at the end of the string.
        # It handles nested structures.
        # Regex to find JSON at the start: ^{ ({ (?: [^{}] | (?1) )* }) }
        # Regex to find JSON at the end: { ({ (?: [^{}] | (?1) )* }) }$
        # We combine them loosely here for simplicity, prioritizing start.

        elif raw_text.startswith('{'):
             match = re.match(r^(\{.*?\})(?:\s|$)", raw_text, re.DOTALL)
             if match:
                potential_json_str = match.group(1)
                try:
                    potential_json = json.loads(potential_json_str)
                    if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                        extracted_json = potential_json
                        text_content = raw_text[len(potential_json_str):].strip()
                        json_string = potential_json_str
                        logger.info("Successfully parsed JSON from the beginning of the string.")
                except json.JSONDecodeError:
                    pass # Not valid JSON at the start

        elif raw_text.endswith('}'):
             # Find the last '{' and try parsing from there
            last_brace = raw_text.rfind('{')
            if last_brace != -1:
                potential_json_str = raw_text[last_brace:]
                try:
                    potential_json = json.loads(potential_json_str)
                    if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                         extracted_json = potential_json
                         text_content = raw_text[:last_brace].strip()
                         json_string = potential_json_str
                         logger.info("Successfully parsed JSON from the end of the string.")
                except json.JSONDecodeError:
                     pass # Not valid JSON at the end

    # --- Strategy 3: Find the *first* balanced JSON object anywhere in the string ---
    # This is less precise but can catch JSON embedded mid-text.
    if not extracted_json:
        try:
            # Find the first opening brace
            first_brace_index = raw_text.find('{')
            if first_brace_index != -1:
                open_braces = 0
                for i in range(first_brace_index, len(raw_text)):
                    if raw_text[i] == '{':
                        open_braces += 1
                    elif raw_text[i] == '}':
                        open_braces -= 1
                        if open_braces == 0:
                            # Found a balanced JSON structure
                            potential_json_str = raw_text[first_brace_index : i + 1]
                            try:
                                potential_json = json.loads(potential_json_str)
                                # Check if it's one of our interactive types
                                if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                                    extracted_json = potential_json
                                    pre_text = raw_text[:first_brace_index].strip()
                                    post_text = raw_text[i + 1 :].strip()
                                    text_content = f"{pre_text}\n\n{post_text}".strip()
                                    json_string = potential_json_str
                                    logger.info("Successfully parsed JSON found mid-string.")
                                    break # Stop after finding the first valid one
                                else:
                                     logger.warning("Found balanced JSON mid-string, but didn't match known interactive keys.")
                            except json.JSONDecodeError:
                                # Invalid JSON, continue searching if needed (though we break here)
                                pass
        except Exception as e:
            logger.error(f"Error during mid-string JSON search: {e}")


    # If JSON was extracted, clean up text_content
    if extracted_json:
         # Remove the original JSON string from text_content if strategies 1 or 3 found it mid-text
         # Strategy 2 handles this by separating text content already.
        if json_string and json_string in text_content:
             text_content = text_content.replace(json_string, "").strip()
         # Clean up potential extra newlines from concatenation
        text_content = re.sub(r'\n\s*\n', '\n\n', text_content).strip()


    # Final check: If no JSON found, ensure textContent is the original raw_text
    if not extracted_json:
        text_content = raw_text # Revert to original if parsing failed to separate

    return {
        "textContent": text_content,
        "interactiveJson": extracted_json
    }
