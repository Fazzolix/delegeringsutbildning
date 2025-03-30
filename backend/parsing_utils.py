# backend/parsing_utils.py
import json
import re
import logging

logger = logging.getLogger(__name__)

# Define known top-level keys for interactive JSON structures based on ai.py prompt
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
    json_block_match = re.search(r"```json\s*(\{.*?\})\s*```", raw_text, re.DOTALL | re.IGNORECASE) # Added IGNORECASE
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
                text_content = f"{pre_text}\n\n{post_text}".strip() if pre_text or post_text else ""
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
                # It wasn't valid JSON, proceed. It might be JSON at start/end with text.
                pass

        # Check if JSON is at the very beginning (with potential text after)
        # This needs to handle nested structures correctly.
        # Corrected regex: caret ^ goes inside the string literal.
        if not extracted_json and raw_text.startswith('{'):
             # Regex to find a valid JSON object at the start, handling nesting
             match = re.match(r"^\s*(\{ (?: [^{}] | \{(?: [^{}] | \{[^{}]*\} )*\} )* \})\s*", raw_text, re.DOTALL | re.VERBOSE)
             if match:
                potential_json_str = match.group(1)
                try:
                    potential_json = json.loads(potential_json_str)
                    if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                        extracted_json = potential_json
                        text_content = raw_text[match.end():].strip() # Get text after the matched JSON + trailing whitespace
                        json_string = potential_json_str
                        logger.info("Successfully parsed JSON from the beginning of the string.")
                    else:
                         logger.warning("Found JSON at start, but didn't match known keys.")
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to decode JSON found at start: {e}")
                    pass # Not valid JSON at the start

        # Check if JSON is at the very end (with potential text before)
        if not extracted_json and raw_text.endswith('}'):
             # Find the last '{' and try parsing from there robustly
            last_brace_index = raw_text.rfind('{')
            while last_brace_index != -1:
                potential_json_str = raw_text[last_brace_index:]
                try:
                    # Attempt to load what looks like JSON at the end
                    potential_json = json.loads(potential_json_str)
                    # Validate structure and keys
                    if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                        # Check if it's *really* at the end (no non-whitespace chars after)
                        if raw_text.endswith(potential_json_str.rstrip()):
                             extracted_json = potential_json
                             text_content = raw_text[:last_brace_index].strip()
                             json_string = potential_json_str
                             logger.info("Successfully parsed JSON from the end of the string.")
                             break # Found valid JSON at the end
                        else:
                             # It parsed, but there was text after it, so it wasn't at the end
                             last_brace_index = raw_text.rfind('{', 0, last_brace_index) # Find next potential start
                             continue
                    else:
                        # Parsed but wrong keys, try earlier brace
                        logger.warning("Found JSON at end, but didn't match known keys.")
                        last_brace_index = raw_text.rfind('{', 0, last_brace_index)
                        continue

                except json.JSONDecodeError:
                    # This substring wasn't valid JSON, find the previous brace
                    last_brace_index = raw_text.rfind('{', 0, last_brace_index)
                    continue # Try again with the earlier brace index

    # --- Strategy 3: Find the *first* balanced JSON object anywhere in the string ---
    # This is less precise but can catch JSON embedded mid-text.
    if not extracted_json:
        try:
            first_brace_index = raw_text.find('{')
            if first_brace_index != -1:
                open_braces = 0
                potential_json_str = None
                # Iterate to find the matching closing brace for the first opening brace
                for i in range(first_brace_index, len(raw_text)):
                    char = raw_text[i]
                    if char == '{':
                        open_braces += 1
                    elif char == '}':
                        open_braces -= 1
                        if open_braces == 0:
                            # Found the end of the first potential JSON object
                            potential_json_str = raw_text[first_brace_index : i + 1]
                            try:
                                potential_json = json.loads(potential_json_str)
                                # Check if it's one of our interactive types
                                if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                                    extracted_json = potential_json
                                    pre_text = raw_text[:first_brace_index].strip()
                                    post_text = raw_text[i + 1 :].strip()
                                    text_content = f"{pre_text}\n\n{post_text}".strip() if pre_text or post_text else ""
                                    json_string = potential_json_str
                                    logger.info("Successfully parsed JSON found mid-string.")
                                    break # Stop after finding the first valid one
                                else:
                                     logger.warning("Found balanced JSON mid-string, but didn't match known interactive keys.")
                                     # Keep searching? For now, we take the first one. If needed, could collect all and choose best.
                                     break
                            except json.JSONDecodeError:
                                # This balanced structure wasn't valid JSON.
                                # We could continue searching for the *next* '{', but finding the *first* match is usually intended.
                                logger.warning(f"Balanced braces found mid-string but failed to parse as JSON: {potential_json_str[:100]}...")
                                break # Stop after checking the first balanced structure
        except Exception as e:
            logger.error(f"Error during mid-string JSON search: {e}")

    # If JSON was extracted, clean up text_content further
    if extracted_json and json_string:
         # Ensure the original JSON string isn't lingering in the text part
        if json_string in text_content:
             text_content = text_content.replace(json_string, "").strip()
         # Clean up potential extra newlines from concatenation or replacement
        text_content = re.sub(r'\n\s*\n', '\n\n', text_content).strip()

    # Final check: If no JSON found, ensure textContent is the original raw_text
    if not extracted_json:
        text_content = raw_text # Revert to original if parsing failed to separate

    # Handle cases where text content might become empty after extraction
    if extracted_json and not text_content:
         # Maybe log this? Sometimes it's expected if the response IS only JSON.
         logger.info("JSON extracted, resulting text content is empty.")


    return {
        "textContent": text_content,
        "interactiveJson": extracted_json
    }
