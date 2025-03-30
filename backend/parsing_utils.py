# Fil: backend/parsing_utils.py
# Kommentar: Korrigerad regex på rad 84 (^ inuti r""). Behåller "text" i INTERACTIVE_JSON_KEYS och förlitar oss på frontend för hantering.
import json
import re
import logging

logger = logging.getLogger(__name__)

# Define known top-level keys for interactive JSON structures based on ai.py prompt
INTERACTIVE_JSON_KEYS = {
    "text", "suggestions", "scenario", "roleplay", "multipleChoice",
    "matching", "ordering", "feedback", "media", "exercise"
    # "text" inkluderas för att fånga upp fall som {"text": "...", "suggestions": ...}
    # där "text" är första nyckeln. Frontend switch-case hanterar detta.
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
    parsing_method = "None" # For logging

    # --- Strategy 1: Look for JSON within ```json ... ``` blocks ---
    json_block_match = re.search(r"```json\s*(\{.*?\})\s*```", raw_text, re.DOTALL | re.IGNORECASE)
    if json_block_match:
        json_string = json_block_match.group(1).strip()
        try:
            potential_json = json.loads(json_string)
            # Check if it's a dictionary and contains at least one known key
            if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                extracted_json = potential_json
                # Extract text before and after the block
                start_index = json_block_match.start()
                end_index = json_block_match.end()
                pre_text = raw_text[:start_index].strip()
                post_text = raw_text[end_index:].strip()
                # Combine pre/post text, handling cases where one might be empty
                if pre_text and post_text:
                    text_content = f"{pre_text}\n\n{post_text}"
                elif pre_text:
                    text_content = pre_text
                elif post_text:
                    text_content = post_text
                else:
                    text_content = "" # Only JSON was present in the block
                parsing_method = "Code Block"
                logger.info(f"Successfully parsed JSON via {parsing_method}.")
            else:
                logger.warning(f"JSON found in code block, but keys {list(potential_json.keys())} didn't match known interactive keys.")
                json_string = None # Reset json_string if it's not our format
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to decode JSON from ```json block: {e}. Content: {json_string[:100]}...")
            json_string = None # Reset on error

    # --- Strategy 2: Look for JSON object starting at the beginning or end (if not found in block)---
    if not extracted_json:
        # Check if the entire string is a JSON object
        if raw_text.startswith('{') and raw_text.endswith('}'):
            try:
                potential_json = json.loads(raw_text)
                if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                    extracted_json = potential_json
                    text_content = "" # Assume no surrounding text if the whole string is JSON
                    json_string = raw_text
                    parsing_method = "Entire String"
                    logger.info(f"Successfully parsed JSON via {parsing_method}.")
                else:
                     logger.warning(f"String looks like JSON, but keys {list(potential_json.keys())} didn't match known interactive keys.")
            except json.JSONDecodeError:
                # It wasn't valid JSON, proceed. It might be JSON at start/end with text.
                pass

        # Check if JSON is at the very beginning (with potential text after)
        # ***** KORRIGERAD REGEX HÄR *****
        if not extracted_json and raw_text.startswith('{'):
             # Regex to find a valid JSON object at the start, handling nesting
             # Using VERBOSE for readability
             # Ensure caret ^ is inside r"..."
             json_start_regex = r"""
                ^\s*                     # Optional whitespace at the beginning
                (                        # Start capturing group 1 (the JSON object)
                    \{                   # Match the opening brace
                        (?:              # Start non-capturing group for content
                            [^{}]        # Match any character that is not a brace
                            |            # OR
                            \{           # Match an opening brace for nesting
                                (?:      # Start nested non-capturing group
                                    [^{}]    # Match non-brace characters inside nesting
                                    |        # OR
                                    \{       # Deeper nesting opening brace
                                        [^{}]* # Match any non-brace characters in deepest level
                                    \}       # Deeper nesting closing brace
                                )*       # End nested non-capturing group, repeat zero or more times
                            \}           # Match the closing brace for nesting
                        )*               # End non-capturing group for content, repeat zero or more times
                    \}                   # Match the final closing brace
                )                        # End capturing group 1
                \s*                      # Optional whitespace after the JSON object
             """
             match = re.match(json_start_regex, raw_text, re.DOTALL | re.VERBOSE)
             if match:
                potential_json_str = match.group(1)
                try:
                    potential_json = json.loads(potential_json_str)
                    if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                        extracted_json = potential_json
                        text_content = raw_text[match.end():].strip() # Get text after the matched JSON + trailing whitespace
                        json_string = potential_json_str
                        parsing_method = "Start of String"
                        logger.info(f"Successfully parsed JSON via {parsing_method}.")
                    else:
                         logger.warning(f"Found JSON structure at start, but keys {list(potential_json.keys())} didn't match known interactive keys.")
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to decode JSON found at start: {e}. Content: {potential_json_str[:100]}...")
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
                        # Check if it's *really* at the end (no non-whitespace chars after it, relative to the start of potential_json_str)
                        if raw_text.endswith(potential_json_str.strip()): # Use strip() for robustness
                             extracted_json = potential_json
                             text_content = raw_text[:last_brace_index].strip()
                             json_string = potential_json_str
                             parsing_method = "End of String"
                             logger.info(f"Successfully parsed JSON via {parsing_method}.")
                             break # Found valid JSON at the end
                        else:
                             # It parsed, but there was text after it, so it wasn't at the end
                             # Try finding the brace before this one
                             last_brace_index = raw_text.rfind('{', 0, last_brace_index)
                             continue
                    else:
                        # Parsed but wrong keys, try earlier brace
                        logger.warning(f"Found JSON structure at end, but keys {list(potential_json.keys())} didn't match known interactive keys.")
                        last_brace_index = raw_text.rfind('{', 0, last_brace_index)
                        continue

                except json.JSONDecodeError:
                    # This substring wasn't valid JSON, find the previous brace
                    last_brace_index = raw_text.rfind('{', 0, last_brace_index)
                    continue # Try again with the earlier brace index

    # --- Strategy 3: Find the *first* balanced JSON object anywhere in the string (Less preferred) ---
    # Only use if other methods failed. This can be ambiguous if multiple JSONs exist.
    if not extracted_json:
        first_brace_index = raw_text.find('{')
        if first_brace_index != -1:
            open_braces = 0
            potential_json_str = None
            # Iterate to find the matching closing brace for the first opening brace
            for i in range(first_brace_index, len(raw_text)):
                char = raw_text[i]
                # Basic string literal handling (ignores escaped quotes)
                in_string = False
                if char == '"':
                    # Look backwards for odd number of backslashes indicating quote is not escaped
                    bs_count = 0
                    for k in range(i - 1, first_brace_index -1, -1):
                        if raw_text[k] == '\\':
                            bs_count += 1
                        else:
                            break
                    if bs_count % 2 == 0:
                        in_string = not in_string # Toggle in_string state

                if not in_string: # Only count braces outside strings
                    if char == '{':
                        open_braces += 1
                    elif char == '}':
                        open_braces -= 1

                if open_braces == 0 and char == '}': # Check char == '}' to ensure we ended on a closing brace
                    # Found the end of the first potential JSON object
                    potential_json_str = raw_text[first_brace_index : i + 1]
                    try:
                        potential_json = json.loads(potential_json_str)
                        # Check if it's one of our interactive types
                        if isinstance(potential_json, dict) and any(key in potential_json for key in INTERACTIVE_JSON_KEYS):
                            extracted_json = potential_json
                            pre_text = raw_text[:first_brace_index].strip()
                            post_text = raw_text[i + 1 :].strip()
                            # Combine pre/post text carefully
                            if pre_text and post_text:
                                text_content = f"{pre_text}\n\n{post_text}"
                            elif pre_text:
                                text_content = pre_text
                            elif post_text:
                                text_content = post_text
                            else:
                                text_content = ""
                            json_string = potential_json_str
                            parsing_method = "Mid-String (First Balanced)"
                            logger.info(f"Successfully parsed JSON via {parsing_method}.")
                            break # Stop after finding the first valid one
                        else:
                             logger.warning(f"Found balanced JSON mid-string, but keys {list(potential_json.keys())} didn't match known interactive keys.")
                             # Keep searching? For now, we take the first one. If needed, could collect all and choose best.
                             # Break here to take the first balanced structure found, even if keys didn't match.
                             # If we wanted to find the *first matching* structure, we would 'continue' searching.
                             break
                    except json.JSONDecodeError:
                        # This balanced structure wasn't valid JSON.
                        # Continue searching from the next character after this potential block ends?
                        # Or just give up on mid-string search after first failure?
                        # Let's give up after checking the first balanced structure.
                        logger.warning(f"Balanced braces found mid-string but failed to parse as JSON: {potential_json_str[:100]}...")
                        break # Stop after checking the first balanced structure
                    # Added safety break if open_braces becomes negative (shouldn't happen with correct logic)
                    except Exception as e_inner:
                        logger.error(f"Unexpected error during mid-string JSON check: {e_inner}")
                        break
                # Safety check for malformed structure
                if open_braces < 0:
                    logger.warning("Mismatched braces detected during mid-string scan.")
                    break


    # If JSON was extracted, clean up text_content further
    if extracted_json and json_string:
         # Ensure the original JSON string isn't lingering in the text part,
         # accounting for potential minor whitespace differences. Be careful not to remove similar text elsewhere.
         # Using replace might be too broad. Let's rely on the pre_text/post_text logic above.
         # text_content = text_content.replace(json_string, "").strip() # Potentially risky
         # Clean up potential extra newlines from concatenation or replacement
         text_content = re.sub(r'\n\s*\n', '\n\n', text_content).strip()

    # Final check: If no JSON found, ensure textContent is the original raw_text
    if not extracted_json:
        text_content = raw_text # Revert to original if parsing failed to separate

    # Handle cases where text content might become empty after extraction
    if extracted_json and not text_content:
         # Maybe log this? Sometimes it's expected if the response IS only JSON.
         logger.info(f"JSON extracted via {parsing_method}, resulting text content is empty.")

    # Log the outcome
    if extracted_json:
        logger.info(f"Parsing complete. Method: {parsing_method}. Text length: {len(text_content)}. JSON keys: {list(extracted_json.keys())}")
    else:
        logger.info(f"Parsing complete. No interactive JSON found. Text length: {len(text_content)}.")


    return {
        "textContent": text_content,
        "interactiveJson": extracted_json
    }
