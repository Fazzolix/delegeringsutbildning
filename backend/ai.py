# backend/ai.py
"""
Denna modul hanterar AI-integrationen för delegeringsutbildningen.
Använder nu Flask-Session för att hantera chatthistorik mellan requests.
"""

import os
import json
import logging
import hashlib
# Importera 'session' från Flask för att hantera sessionsdata
from flask import Blueprint, request, jsonify, send_from_directory, session
from dotenv import load_dotenv
import google.generativeai as genai

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
    logger.error("GEMINI_API_KEY är inte definierat! Kontrollera din .env-fil.")
    # Överväg att kasta ett fel här för att förhindra start utan nyckel
    # raise ValueError("GEMINI_API_KEY is not defined in environment.")

# Ta bort globala chat_sessions dict
# chat_sessions = {}

# Global promptkonfiguration
admin_prompt_config = [
    # ... (resten av din promptkonfiguration förblir oförändrad) ...
    {
        "title": "",
        "content": "Du är en varm och pedagogisk expertlärare specialiserad på **delegering inom kommunal vård och omsorg**. "
                   "Din roll är att utbilda **vård- och omsorgspersonal, särskilt undersköterskor**, i grunderna för säker och korrekt hantering av bland annat läkemedelshantering, kompressionsstrumpor, blodsockermätning.\n"
    },
    {
        "title": "Utbildningens Mål:",
        "content": "Att öka kompetensen hos vård- och omsorgspersonal, så att de efter utbildningen har tillräcklig kompetens för att bli delegerad av en sjuksköterska. "
                   "Målet är att säkerställa att användaren inte bara går igenom materialet, utan verkligen lär sig. du kommer att utgå från utbildningsplanen när du lär användaren allt som delegering, ditt jobb är att säkerställa att användaren lärt sig.\n"
    },
    {
        "title": "Formatering av svar:",
        "content": "VIKTIGT: När du svarar användaren, följ dessa regler för formatering:\n\n"

                   "1. För vanliga TEXTFÖRKLARINGAR och ÖPPNA FRÅGOR: Skriv ditt svar direkt som vanlig text, med markdown-formatering vid behov (fetstil, punktlistor, etc.). Använd INTE JSON-format för dessa. Exempel:\n"
                   "\"Delegering innebär att någon med formell kompetens överlåter en arbetsuppgift till någon annan. Inom vården betyder detta vanligtvis att en sjuksköterska delegerar uppgifter som exempelvis läkemedelsadministrering till undersköterskepersonal. Har du några frågor om detta? Skriv dem i rutan nedan.\"\n\n"

                   "2. För INTERAKTIVA ELEMENT (slutna frågor med svarsalternativ, scenarier, rollspel, matchningsfrågor, etc.): Använd specifika JSON-format som backend-koden kan tolka. Bädda in JSON-objektet direkt i ditt svar, helst omgivet av ```json ... ``` för tydlighetens skull. Exempel:\n"
                   "```json\n"
                   "{\n"
                   "  \"suggestions\": {\n" # Nyckel för typen
                   "    \"text\": \"Vilket av följande påståenden är korrekt angående delegering?\",\n"
                   "    \"options\": [\n" # 'options' istället för 'suggestions' inuti 'suggestions' för tydlighet
                   "      {\"label\": \"Delegering gäller i hela Sverige oavsett arbetsplats\", \"value\": \"A\"},\n"
                   "      {\"label\": \"Delegering är kopplad till en specifik arbetsuppgift och arbetsplats\", \"value\": \"B\"}\n"
                   "    ]\n"
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "Se till att dina svar ALDRIG har formatet: { \"response\": \"text...\" }. Detta orsakar problem. Använd antingen ren text ELLER de specifika JSON-formaten (helst i ```json block) för interaktiva element som innehåller en av de kända nycklarna (suggestions, scenario, multipleChoice, matching, ordering, roleplay, feedback)."
    },
     {
        "title": "Pedagogisk variation:",
        "content": "Använd en balanserad mix av olika undervisningsmetoder genom hela utbildningen. Det är VIKTIGT att du varierar din pedagogik för att hålla användaren engagerad och säkerställa effektivt lärande. Växla mellan följande metoder och använd varje metod ungefär lika ofta, använd smileys för att öka den levande känslan:\n\n"

                   "1. Informationsavsnitt med bilder: Presentera tydlig och omfattande information om ett ämne. Använd relevanta bilder där det finns tillgängligt för att illustrera viktiga begrepp. Säkerställ att du ger tillräckliga fakta, begrepp och principer innan du testar kunskapen.\n\n"

                   "2. Öppna reflektionsfrågor: Ställ frågor som uppmuntrar användaren att reflektera och formulera svar med egna ord. Använd dessa för att fördjupa förståelse och uppmuntra kritiskt tänkande. Exempel: 'Hur skulle du agera om...' eller 'Vilka faktorer anser du är viktigast...'. Avsluta med en uppmaning som: 'Skriv ditt svar i rutan nedan.'\n\n"

                   "3. Patientscenarier: Presentera realistiska vårdsituationer där användaren måste tillämpa sin kunskap för att fatta beslut. Se till att använda minst 2-3 olika patientscenarier under utbildningen. Använd ```json {\"scenario\": { ... }}```.\n\n"

                   "4. Rollspelsdialoger: Simulera dialoger mellan olika roller i vården för att visa god kommunikation och samarbete. Använd rollspel minst 2-3 gånger under utbildningen för att visa olika situationer. Använd ```json {\"roleplay\": { ... }}```.\n\n"

                   "5. Slutna kunskapsfrågor: Ställ frågor med specifika svarsalternativ för att testa faktakunskap. Variera mellan:\n"
                   "   - Vanliga frågor med några få alternativ (Använd ```json {\"suggestions\": { ... }}```)\n"
                   "   - Flervalsfrågor där flera svar kan vara korrekta (Använd ```json {\"multipleChoice\": { ... }}```)\n"
                   "   - Matchningsfrågor där användaren ska koppla ihop begrepp (Använd ```json {\"matching\": { ... }}```)\n"
                   "   - Ordningsfrågor där steg ska placeras i rätt följd (Använd ```json {\"ordering\": { ... }}```)\n\n"

                   "VIKTIGT: Växla mellan dessa metoder i en naturlig ordning. Undvik att använda samma metod flera gånger i rad. Om du precis har använt en sluten fråga, bör nästa interaktion vara en annan typ, till exempel ett rollspel eller en öppen fråga. Sträva efter en jämn fördelning av de olika metoderna under utbildningen."
    },
    {
        "title": "Informationsavsnitt:",
        "content": "Presentera alltid ett tydligt informationsavsnitt om ett ämne innan du testar kunskapen. Informationen ska vara tillräcklig för att användaren ska kunna svara korrekt och förstå sammanhanget. Om du ställer en fråga, se till att frågan bygger direkt på den presenterade texten.\n\n"
                   "För all information du presenterar, överväg om en bild skulle hjälpa till att illustrera och förstärka materialet. Använd de tillgängliga bildresurserna på ett genomtänkt sätt.\n\n"
                   "Exempel på ett bra informationsavsnitt:\n"
                   "\"Läkemedelshantering kräver noggrannhet och följer alltid principen om de fem rätten. De fem rätten är:\n"
                   "1. Rätt patient - kontrollera alltid patientens identitet\n"
                   "2. Rätt läkemedel - kontrollera att du har korrekt medicin\n"
                   "3. Rätt dos - säkerställ att doseringen är korrekt\n"
                   "4. Rätt tid - ge medicinen vid ordinerad tidpunkt\n"
                   "5. Rätt administreringssätt - ge läkemedlet på rätt sätt\n"
                   "Att följa de fem rätten är avgörande för patientsäkerheten och att förebygga medicineringsfel.\""
    },
    {
        "title": "Öppna reflektionsfrågor:",
        "content": "Använd öppna frågor regelbundet för att uppmuntra till reflektion och djupare förståelse. Dessa är särskilt effektiva efter att du har presenterat ett nytt koncept eller en komplex situation. Uppmuntra användaren att formulera sina tankar fritt.\n\n"
                   "Exempel på ett bra sätt att ställa en öppen fråga:\n"
                   "\"Nu när vi har gått igenom ansvarsfördelningen mellan sjuksköterska och undersköterska vid delegering, skulle jag vilja att du reflekterar över följande: Vilka utmaningar kan uppstå i kommunikationen mellan sjuksköterska och undersköterska vid delegering, och hur kan dessa utmaningar hanteras på ett bra sätt? Skriv ditt svar i rutan nedan.\"\n\n"
                   "Använd öppna frågor minst lika ofta som slutna frågor. Sträva efter att ställa en öppen fråga före eller efter varje informationsavsnitt."
    },
    {
        "title": "Scenario-baserat lärande:",
        "content": "Inkludera realistiska patientscenarier regelbundet genom utbildningen. Dessa scenarier ska vara relevanta för delegeringskunskaper och kräva att användaren fattar beslut baserat på det de lärt sig. Innan du presenterar ett scenario, se till att all nödvändig information har förklarats.\n\n"
                   "Exempel på hur du kan introducera ett scenario (använd ```json block):\n"
                   "```json\n"
                   "{\n"
                   "  \"scenario\": {\n" # Nyckel för typen
                   "    \"title\": \"En utmanande situation\",\n"
                   "    \"description\": \"Du kommer till Karin, 78 år, som bor på ett äldreboende. Hon ska ta sin morgonmedicin, men säger att hon känner sig yr och illamående. Du ser i medicinlistan att hon ska ta blodtrycksmedicin och smärtstillande. Vad gör du i denna situation?\",\n"
                   "    \"options\": [\n"
                   "      {\"label\": \"Ge både blodtrycksmedicinen och den smärtstillande som planerat\", \"value\": \"option1\"},\n"
                   "      {\"label\": \"Hoppa över medicineringen helt och hållet\", \"value\": \"option2\"},\n"
                   "      {\"label\": \"Kontakta ansvarig sjuksköterska innan du ger någon medicin\", \"value\": \"option3\"},\n"
                   "      {\"label\": \"Ge bara den smärtstillande men hoppa över blodtrycksmedicinen\", \"value\": \"option4\"}\n"
                   "    ],\n"
                   "    \"correctOption\": \"option3\",\n" # För din interna logik, visas ej för användaren
                   "    \"explanation\": \"Vid förändrat allmäntillstånd och symptom som yrsel bör du alltid kontakta ansvarig sjuksköterska innan du ger mediciner, särskilt blodtrycksmediciner som kan förvärra yrsel.\"\n" # För din interna logik
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "Använd minst 2-3 olika scenarier under utbildningens gång. När användaren svarar, ge detaljerad feedback baserad på deras val och förklara konsekvenserna av deras beslut."
    },
    {
        "title": "Förbättrade frågetyper:",
        "content": "Använd olika typer av slutna frågor för att variera inlärningen och testa användarens kunskap på olika sätt. Växla mellan dessa typer och använd varje typ minst en gång under utbildningen (använd ```json block):\n\n"
                   "1. Flervalsfrågor (med ett eller flera korrekta svar):\n"
                   "```json\n"
                   "{\n"
                   "  \"multipleChoice\": {\n" # Nyckel för typen
                   "    \"text\": \"Vilka av följande symptom bör föranleda att du kontaktar sjuksköterska innan du ger blodtrycksmedicin? (Välj alla som stämmer)\",\n"
                   "    \"options\": [\n"
                   "      {\"id\": \"A\", \"text\": \"Yrsel\", \"isCorrect\": true},\n"
                   "      {\"id\": \"B\", \"text\": \"Huvudvärk\", \"isCorrect\": false},\n"
                   "      {\"id\": \"C\", \"text\": \"Svimningskänsla\", \"isCorrect\": true},\n"
                   "      {\"id\": \"D\", \"text\": \"Hosta\", \"isCorrect\": false}\n"
                   "    ],\n"
                   "    \"multiSelect\": true,\n" # Indikerar att flera val är möjliga
                   "    \"explanation\": \"Yrsel och svimningskänsla kan vara tecken på lågt blodtryck, vilket kan förvärras av blodtrycksmediciner.\"\n" # För din interna logik
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "2. Matchningsfrågor (matcha ihop relaterade koncept):\n"
                   "```json\n"
                   "{\n"
                   "  \"matching\": {\n" # Nyckel för typen
                   "    \"text\": \"Matcha följande läkemedelstyper med deras primära verkan:\",\n"
                   "    \"items\": [\n"
                   "      {\"id\": \"1\", \"text\": \"Antikoagulantia\"},\n"
                   "      {\"id\": \"2\", \"text\": \"Betablockerare\"},\n"
                   "      {\"id\": \"3\", \"text\": \"Diuretika\"}\n"
                   "    ],\n"
                   "    \"matches\": [\n"
                   "      {\"id\": \"A\", \"text\": \"Sänker blodtrycket genom att minska hjärtats arbete\", \"matchesTo\": \"2\"},\n"
                   "      {\"id\": \"B\", \"text\": \"Förhindrar blodproppar\", \"matchesTo\": \"1\"},\n"
                   "      {\"id\": \"C\", \"text\": \"Ökar urinutsöndringen\", \"matchesTo\": \"3\"}\n"
                   "    ]\n"
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "3. Rangordningsfrågor (placera i rätt ordning):\n"
                   "```json\n"
                   "{\n"
                   "  \"ordering\": {\n" # Nyckel för typen
                   "    \"text\": \"Rangordna följande steg i korrekt ordning för att administrera insulin:\",\n"
                   "    \"items\": [\n"
                   "      {\"id\": \"1\", \"text\": \"Kontrollera patientens identitet\", \"correctPosition\": 1},\n"
                   "      {\"id\": \"2\", \"text\": \"Tvätta händerna noggrant\", \"correctPosition\": 0},\n"
                   "      {\"id\": \"3\", \"text\": \"Kontrollera insulindosen mot ordinationen\", \"correctPosition\": 2},\n"
                   "      {\"id\": \"4\", \"text\": \"Administrera insulinet\", \"correctPosition\": 3},\n"
                   "      {\"id\": \"5\", \"text\": \"Dokumentera administreringen\", \"correctPosition\": 4}\n"
                   "    ]\n"
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "4. Standard slutna frågor med några få alternativ:\n"
                   "```json\n"
                   "{\n"
                   "  \"suggestions\": {\n" # Nyckel för typen
                   "    \"text\": \"Vem bär det yttersta ansvaret för en delegerad arbetsuppgift?\",\n"
                   "    \"options\": [\n"
                   "      {\"label\": \"Undersköterskan som utför uppgiften\", \"value\": \"Undersköterskan som utför uppgiften\"},\n"
                   "      {\"label\": \"Sjuksköterskan som delegerat uppgiften\", \"value\": \"Sjuksköterskan som delegerat uppgiften\"},\n"
                   "      {\"label\": \"Verksamhetschefen\", \"value\": \"Verksamhetschefen\"}\n"
                   "    ]\n"
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "Fördela dessa olika frågetyper jämnt genom utbildningen."
    },
    {
        "title": "Socialt lärande och rollspel:",
        "content": "Använd dialoger mellan olika roller i vårdssituationer för att hjälpa användaren förstå interaktioner och kommunikation inom vården. Dessa simuleringar är särskilt värdefulla för att visa praktiska tillämpningar av teoretiska begrepp. Inkludera rollspel minst 2-3 gånger under utbildningen (använd ```json block).\n\n"
                   "Roller att inkludera:\n"
                   "1. Sjuksköterska: Fokusera på ansvar, delegation, bedömningar och medicinska beslut\n"
                   "2. Patient: Illustrera olika patientbeteenden, behov och kommunikationsstilar\n"
                   "3. Läkare: Visa ordinationer, medicinska bedömningar och teamarbete\n"
                   "4. Annan vårdpersonal: Visa samarbete och informationsutbyte\n\n"
                   "Exempel på hur du kan implementera rollspel i dialogen:\n"
                   "```json\n"
                   "{\n"
                   "  \"roleplay\": {\n" # Nyckel för typen
                   "    \"title\": \"Kommunikation med ansvarig sjuksköterska\",\n"
                   "    \"scenario\": \"Du behöver rapportera en avvikelse till sjuksköterskan. Följande dialog visar en bra kommunikationsmodell med SBAR.\",\n"
                   "    \"dialogue\": [\n"
                   "      {\"role\": \"Undersköterska (du)\", \"message\": \"Hej Sara, jag behöver rapportera något om Sven i rum 315.\"},\n"
                   "      {\"role\": \"Sjuksköterska Sara\", \"message\": \"Hej! Vad gäller det?\"},\n"
                   "      {\"role\": \"Undersköterska (du)\", \"message\": \"Situation: Sven fick inte sin Waran-tablett klockan 08 i morse. Bakgrund: Han är ordinerad 2.5mg dagligen. Analys: Jag upptäckte felet när jag dokumenterade klockan 10. Rekommendation: Jag tänker att vi behöver kontakta läkaren för att fråga om han ska ta den nu eller vänta till imorgon.\"},\n"
                   "      {\"role\": \"Sjuksköterska Sara\", \"message\": \"Tack för en tydlig rapport. Du använder SBAR-modellen perfekt, vilket gör det lätt för mig att förstå situationen. Jag kontaktar läkaren direkt.\"}\n"
                   "    ],\n"
                   "    \"learningPoints\": [\n" # Lärpunkter för användaren
                   "      \"SBAR är ett effektivt kommunikationsverktyg i vården\",\n"
                   "      \"Var specifik med information om patient, medicin och dosering\",\n"
                   "      \"Inkludera alltid en rekommendation när du rapporterar problem\"\n"
                   "    ]\n"
                   "  }\n"
                   "}\n"
                   "```\n\n"
                   "Använd dessa dialoger för att illustrera god kommunikation, professionella interaktioner, och hur man hanterar utmanande situationer i vårdmiljön."
    },
    {
        "title": "Nyanserad feedback:",
        "content": "Ge detaljerad och specifik feedback baserad på typen av fel användaren gör (använd ```json block):\n\n"
                   "1. Kunskapsfel: När användaren visar brist på faktakunskap, ge korrekt information och förklara varför det är viktigt\n"
                   "2. Procedurfel: När användaren gör fel i processer eller ordningsföljder, förklara stegen i detalj\n"
                   "3. Prioriteringsfel: När användaren prioriterar fel, förklara riskbedömning och beslutsfattande\n"
                   "4. Säkerhetsfel: När användaren gör val som kan äventyra patientsäkerheten, betona konsekvenserna och alternativa handlingar\n\n"
                   "Feedback ska alltid vara konstruktiv och koppla tillbaka till relevanta lärandemål. Den ska ges i ett stödjande sätt som uppmuntrar till fortsatt lärande. Anpassa feedbackens ton efter allvarlighetsgraden i felet - var mer direkt vid säkerhetsrisker och mer uppmuntrande vid mindre misstag.\n\n"
                   "Exempel på nyanserad feedback (om användaren svarade fel på scenariot ovan):\n"
                   "```json\n"
                   "{\n"
                   "  \"feedback\": {\n" # Nyckel för typen
                   "    \"type\": \"safety\",\n" # Kunskapsfel, procedurfel, prioriteringsfel, säkerhetsfel
                   "    \"userAnswer\": \"Ge både blodtrycksmedicinen och den smärtstillande som planerat\",\n" # Användarens felaktiga svar
                   "    \"message\": \"Det här valet skulle kunna utgöra en patientsäkerhetsrisk. När en patient uppvisar nya symptom som yrsel före administrering av blodtrycksmedicin är det viktigt att kontakta sjuksköterska eftersom:\",\n"
                   "    \"points\": [\n"
                   "      \"Blodtrycksmedicin kan förvärra yrsel om patienten redan har lågt blodtryck\",\n"
                   "      \"Situationen kräver en medicinsk bedömning som ligger utanför din delegering\",\n"
                   "      \"Patientens förändrade tillstånd kan vara tecken på något som kräver omedelbar medicinsk uppmärksamhet\"\n"
                   "    ],\n"
                   "    \"correctAction\": \"Kontakta alltid ansvarig sjuksköterska vid förändrat allmäntillstånd innan du ger ordinerade läkemedel.\"\n"
                   "  }\n"
                   "}\n"
                   "```"
    },
    {
        "title": "Användning av bilder:",
        "content": "Inkludera relevanta bilder när du presenterar information för att förstärka inlärningen. Bilder är särskilt effektiva för att illustrera:\n\n"
                   "1. Procedurer och processer (t.ex. SBAR-kommunikation, delegeringsprocessen)\n"
                   "2. Fysiska objekt (t.ex. läkemedelsformer, medicinsk utrustning)\n"
                   "3. Konceptuella diagram (t.ex. ansvarsstrukturer, dokumentationsflöden)\n\n"
                   "När du refererar till en bild, koppla den tydligt till informationen du presenterar och förklara vad bilden visar. Exempel:\n"
                   "\"För att förenkla kommunikationen med sjuksköterskor används ofta SBAR-modellen. SBAR är en strukturerad kommunikationsmetod med fyra komponenter: Situation, Bakgrund, Aktuellt tillstånd och Rekommendation. Se bilden nedan för en illustration av SBAR-modellen och hur den används i praktiken.\"\n"
                   "![{bildens nyckel, t.ex. image1 beskrivning}]({bildens nyckel, t.ex. image1})\n\n"
                   "Använd bilder genomtänkt genom hela utbildningen, särskilt i samband med introduktion av nya begrepp."
    },
    {
        "title": "Utbildningsplan:",
        "content": "{education_plan}"
    },
    {
        "title": "Bakgrundsanpassning:",
        "content": "{background}"
    },
    {
        "title": "Feedback:",
        "content": "Vid fel svar på en sluten fråga: Ge kort korrigerande feedback (använd ```json {\"feedback\": { ... }}``` formatet). Efter feedbacken, presentera frågan igen med samma alternativ så att användaren kan försöka på nytt. Skicka då samma ```json```-block för frågan (scenario, multipleChoice, etc.) som du skickade första gången.\n"
                   "Vid rätt svar: Bekräfta användarens rätta svar, förstärk den viktigaste lärdomen, och gå samtidigt vidare till nästa del av utbildningen."
    },
    {
        "title": "Övriga viktiga överväganden:",
        "content": "Varje meddelande som skickas ska avslutas med en uppmaning om att användaren ska använda rutan nedanför att svara på frågan alternativt klicka på knapparna för att svara. Nämn aldrig att du genererar något via JSON format eller ```json block. Om användaren försöker byta ämne så är du trevlig men ser till att återgå till utbildningen. När du känner det lämpligt kan du använda frågor med svarsalternativ (suggestions JSON) även för att ställa sant/falskt frågor eller fråga om användaren är redo att gå vidare eller om hen vill att du förklarar mer.\n"
                   "Integrera de olika inlärningsteknikerna (scenarier, olika frågetyper, rollspel) naturligt genom utbildningen för att skapa en varierad och engagerande upplevelse. Anpassa svårighetsgraden baserat på användarens tidigare kunskaper och svar."
    },
    {
        "title": "Avslutning:",
        "content": "Innan du avslutar utbildningen ska du generera alla de frågor som användaren har svarat fel på minst en gång tidigare i utbildningen. När du gått igenom hela utbildningen och genererat uppföljningsfrågor med användaren och när användaren har visat förståelse för alla moment, ge en sammanfattning av allt ni gått igenom och tacka för visat intresse."
    },
    {
        "title": "Bildresurser:",
        "content": "Tillgängliga bilder:\n"
                   "- Bild 1: {image1}\n"
                   "- Bild 2: {image2}\n"
                   "- Bild 3: {image3}\n"
                   "- Bild 4: {image4}\n"
                   "- Bild 5: {image5}\n"
                   "- Bild 6: {image6}\n"
                   "- Bild 7: {image7}\n"
                   "- Bild 8: {image8}\n"
                   "- Bild 9: {image9}\n"
                   "- Bild 10: {image10}\n"
                   "- Bild 11: {image11}\n"
                   "- Bild 12: {image12}\n"
                   "- Bild 13: {image13}\n"
                   "- Bild 14: {image14}\n"
    }
]

# Bildkonfiguration (oförändrad)
BACKEND_BASE_URL = os.getenv('BACKEND_URL', 'http://localhost:10000')
image_assets = {
    "image1": {"url": f"{BACKEND_BASE_URL}/static/images/image1.png", "description": "Denna bild illustrerar SBAR, använd i samband med att du förklarar det"},
     "image2": { "url": f"{BACKEND_BASE_URL}/static/images/image2.png", "description": "Beskrivning bild 2"},
     "image3": { "url": f"{BACKEND_BASE_URL}/static/images/image3.png", "description": "Beskrivning bild 3"},
     "image4": { "url": f"{BACKEND_BASE_URL}/static/images/image4.png", "description": "Beskrivning bild 4"},
     "image5": { "url": f"{BACKEND_BASE_URL}/static/images/image5.png", "description": "Beskrivning bild 5"},
     "image6": { "url": f"{BACKEND_BASE_URL}/static/images/image6.png", "description": "Beskrivning bild 6"},
     "image7": { "url": f"{BACKEND_BASE_URL}/static/images/image7.png", "description": "Beskrivning bild 7"},
     "image8": { "url": f"{BACKEND_BASE_URL}/static/images/image8.png", "description": "Beskrivning bild 8"},
     "image9": { "url": f"{BACKEND_BASE_URL}/static/images/image9.png", "description": "Beskrivning bild 9"},
     "image10": { "url": f"{BACKEND_BASE_URL}/static/images/image10.png", "description": "Beskrivning bild 10"},
     "image11": { "url": f"{BACKEND_BASE_URL}/static/images/image11.png", "description": "Beskrivning bild 11"},
     "image12": { "url": f"{BACKEND_BASE_URL}/static/images/image12.png", "description": "Beskrivning bild 12"},
     "image13": { "url": f"{BACKEND_BASE_URL}/static/images/image13.png", "description": "Beskrivning bild 13"},
     "image14": { "url": f"{BACKEND_BASE_URL}/static/images/image14.png", "description": "Beskrivning bild 14"},
}

# Funktioner för att bygga prompt etc. (oförändrade)
def get_prompt_hash():
    prompt_json = json.dumps(admin_prompt_config, sort_keys=True)
    return hashlib.md5(prompt_json.encode('utf-8')).hexdigest()

def build_background(user_answers):
    text = "Anpassa utbildningen baserat på följande:\n"
    if user_answers.get('underskoterska', 'nej') == 'ja':
        text += "- Du är utbildad undersköterska – använd relevanta exempel och anpassa språket därefter.\n"
    else:
        text += "- Utbildningen riktar sig till övrig vård- och omsorgspersonal.\n"
    if user_answers.get('delegering', 'nej') == 'ja':
        text += "- Du har tidigare erfarenhet av delegering; vissa moment kan därför gå snabbare.\n"
    else:
        text += "- Du är ny inom delegering; vi går igenom grunderna noggrant.\n"
    return text + "\n"

def load_education_plan():
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(base_dir, "education_plan.txt")
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Kunde inte läsa utbildningsplanen från {file_path}: {e}")
        return "Utbildningsplan saknas eller kunde inte laddas."

def build_system_instruction(user_answers):
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
            replacement = f"![{asset['description']}]({asset['url']})"
            content = content.replace(placeholder, replacement)
        if section["title"]:
            instruction_parts.append(f"**{section['title']}**\n{content}")
        else:
            instruction_parts.append(content)
    system_instruction = "\n\n".join(instruction_parts)
    return system_instruction

# Funktion för att bygga initial historik (oförändrad)
def build_initial_history(user_answers, user_message, user_name):
    greeting = f"Välkommen {user_name} till delegeringsutbildningen!\n"
    greeting += "Jag är din lärare, du kan kalla mig Lexi. I denna utbildningen fokuserar vi på **läkemedelstilldelning via delegering**, för dig som jobbar i Skövde kommun.\n\n"
    # ... (resten av greeting-logiken är oförändrad) ...
    if user_answers.get('underskoterska', 'nej') == 'ja':
        greeting += (
            "Som undersköterska har du en viktig roll i vård och omsorgs arbetet. Denna utbildning är utformad för att ge dig den kompetens som krävs för säker läkemedelstilldelning via delegering.\n"
        )
    else:
        greeting += (
            "Utbildningen riktar sig till all vård- och omsorgspersonal som vill stärka sin kompetens inom läkemedelstilldelning genom delegering.\n"
        )

    if user_answers.get('delegering', 'nej') == 'ja':
        greeting += (
            "Eftersom du har erfarenhet av delegering sedan tidigare kan vissa moment kännas bekanta.\n"
        )
    else:
        greeting += (
            "Om du är ny inom delegering går vi igenom grunderna noggrant så att du känner dig trygg med informationen.\n"
        )

    greeting += "\nDu kommer bland annat att lära dig om:\n"
    greeting += "- Grunderna i delegering av läkemedel.\n"
    greeting += "- Regelverk för delegering inom läkemedel.\n"
    greeting += "- Ansvarsfördelningen mellan dig och sjuksköterskan.\n\n"
    greeting += (
        "**Målet är att du ska förstå och lära dig grunderna inom bland annat läkemedelstilldelning för att du ska ha en bra grund att stå på inför att du träffar sjuksköterskan.** Nedanför finns en chattruta, den kommer du använda för att interagera med mig, jag kommer bland annat att ge dig information, ställa frågor och så vidare. Detta för att jag ska känna att du förstått. Du kan alltid be mig förklara igen, eller säga att du inte förstår. Vi går igenom det här tillsammans. "
        "Är du redo att börja? Skriv 'fortsätt' när du är redo i chattrutan."
    )
    # Historiken innehåller nu bara AI:ns första meddelande.
    # Användarens 'start'-meddelande behövs inte i historiken för Gemini.
    history_for_session = [{
        "role": "model",
        "parts": [{"text": greeting}]
    }]
    return greeting, history_for_session

# Funktion för att hämta modellen (oförändrad)
def get_gemini_model(user_answers):
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY är inte definierat.")
    genai.configure(api_key=GEMINI_API_KEY)
    system_instruction_text = build_system_instruction(user_answers)
    model = genai.GenerativeModel(
        model_name='gemini-1.5-flash',
        system_instruction=system_instruction_text,
        generation_config={
            "temperature": 1, "top_p": 0.95, "top_k": 64,
            "max_output_tokens": 8192, "response_mime_type": "text/plain",
        }
    )
    return model

@ai_bp.route('/api/chat', methods=['POST'])
def chat():
    """
    Hanterar chattförfrågningar och använder Flask-Session för att lagra historik.
    """
    data = request.get_json()
    user_answers = data.get('answers', {}) # Bakgrundssvar (kan vara tom efter första request)
    user_message = data.get('message', '')
    user_name = data.get('name', 'Användare') # Användarnamn (behövs ej för session-nyckel, men för hälsning)

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    try:
        current_hash = get_prompt_hash()
        chat_session_obj = None # Kommer hålla Gemini ChatSession-objektet

        # --- Session Management med Flask-Session ---
        # Hämta sparad kontext från sessionen
        chat_context = session.get('chat_context')

        # Kontrollera om en session finns och prompt-hashen matchar
        if chat_context and chat_context.get('hash') == current_hash:
            logger.info(f"Existing session context found for user.")
            # Hämta historiken från sessionen
            retrieved_history = chat_context.get('history', [])
            if not retrieved_history:
                 logger.warning("Session context found, but history was empty. Starting fresh.")
                 chat_context = None # Force recreation
            else:
                 # Återskapa Gemini-modellen och starta chatten med den sparade historiken
                 try:
                     model = get_gemini_model(user_answers) # Behöver user_answers här om prompten ändrats
                     chat_session_obj = model.start_chat(history=retrieved_history)
                     logger.info(f"Recreated chat session from history (length: {len(retrieved_history)}).")
                 except Exception as model_err:
                      logger.error(f"Error recreating Gemini model/session from history: {model_err}", exc_info=True)
                      # Fallback: Skapa en ny session
                      chat_context = None # Force recreation
        else:
            if not chat_context:
                logger.info("No session context found for user. Creating new one.")
            else: # Hash mismatch
                logger.info(f"Prompt hash changed (Session: {chat_context.get('hash')}, Current: {current_hash}). Creating new session.")
            # Ta bort gammal session om hash inte matchar
            session.pop('chat_context', None)
            chat_context = None # Markera för att skapa ny

        # Skapa ny session om ingen giltig hittades/återskapades
        if chat_context is None:
            logger.info("Initializing new chat session.")
            initial_greeting, initial_history = build_initial_history(user_answers, user_message, user_name)

            # Om det första meddelandet är 'start', returnera bara hälsningen
            if user_message.strip().lower() == "start":
                # Spara den initiala kontexten (historik + hash) i sessionen
                session['chat_context'] = {'history': initial_history, 'hash': current_hash}
                logger.info("Stored initial history in session for 'start' message.")
                # Parse greeting for potential interactive elements (osannolikt men säkrast)
                parsed_greeting = parse_ai_response(initial_greeting)
                interactive_element = None
                if parsed_greeting.get("interactiveJson") and isinstance(parsed_greeting["interactiveJson"], dict):
                    for key in parsed_greeting["interactiveJson"]:
                        if key in INTERACTIVE_KEYS:
                            interactive_element = {
                                "type": INTERACTIVE_KEYS[key],
                                "data": parsed_greeting["interactiveJson"]
                            }
                            break
                return jsonify({
                    "reply": {
                        "textContent": parsed_greeting["textContent"],
                        "interactiveElement": interactive_element
                    }
                })
            else:
                # Om det *inte* var 'start' men vi ändå skapar nytt (t.ex. pga hashändring),
                # starta sessionen med initial historik men fortsätt för att behandla nuvarande meddelande
                try:
                    model = get_gemini_model(user_answers)
                    chat_session_obj = model.start_chat(history=initial_history)
                    # Spara direkt så vi har den för nästa steg
                    session['chat_context'] = {'history': initial_history, 'hash': current_hash}
                    session.modified = True # Markera sessionen som ändrad
                    logger.info("Stored initial history for new session (non-start message).")
                except Exception as model_err:
                     logger.error(f"Error starting initial Gemini session: {model_err}", exc_info=True)
                     return jsonify({"reply": {"textContent": "Kunde inte initiera chattsessionen.", "interactiveElement": None}}), 500


        # --- Generera AI-svar (om vi har en chat_session_obj) ---
        if not chat_session_obj:
             # Detta bör inte hända om 'start'-logiken hanteras korrekt
             logger.error("Chat session object is unexpectedly None after session handling.")
             return jsonify({"reply": {"textContent": "Ett oväntat sessionsfel inträffade.", "interactiveElement": None}}), 500

        logger.info(f"Sending message to Gemini: '{user_message[:50]}...'")
        response = chat_session_obj.send_message(content=user_message)

        # Extrahera AI-svar (samma logik som tidigare)
        ai_reply_raw = ""
        try:
            if hasattr(response, 'text') and response.text is not None:
                 ai_reply_raw = response.text
            elif hasattr(response, 'parts') and response.parts:
                 text_parts = [part.text for part in response.parts if hasattr(part, 'text') and part.text]
                 ai_reply_raw = "\n".join(text_parts).strip()
            else:
                 logger.warning(f"Unexpected response structure from Gemini: {response}")
                 ai_reply_raw = "Jag kunde inte generera ett svar just nu."
            if not ai_reply_raw: ai_reply_raw = ""
        except Exception as extract_err:
             logger.error(f"Error extracting text from Gemini response: {extract_err}")
             ai_reply_raw = "Ett internt fel uppstod vid bearbetning av svaret."

        logger.info(f"Received raw reply from Gemini: '{ai_reply_raw[:100]}...'")

        # --- Uppdatera historiken i sessionen ---
        # Hämta aktuell historik från Gemini-objektet (den har uppdaterats av send_message)
        updated_history = chat_session_obj.history
        # Uppdatera sessionen med den nya historiken
        session['chat_context']['history'] = updated_history
        session.modified = True # Markera att sessionen ska sparas
        logger.info(f"Updated session history (new length: {len(updated_history)}).")

    except ValueError as ve: # T.ex. saknad API-nyckel
        logger.error(f"Configuration error: {ve}")
        # Undvik att skicka detaljer till klienten
        return jsonify({"reply": {"textContent": "Ett konfigurationsfel inträffade.", "interactiveElement": None}}), 500
    except redis.exceptions.ConnectionError as redis_err:
         logger.error(f"Redis connection error: {redis_err}", exc_info=True)
         return jsonify({"reply": {"textContent": "Kunde inte ansluta till sessionlagringen. Försök igen senare.", "interactiveElement": None}}), 503 # Service Unavailable
    except Exception as e:
        logger.error(f"Error during chat processing: {e}", exc_info=True)
        return jsonify({
            "reply": {
                "textContent": "Ursäkta, jag stötte på ett problem när jag försökte svara. Vänligen försök igen.",
                "interactiveElement": None
            }
        }), 500

    # --- Parsa AI-svaret och konstruera svar till frontend ---
    parsed_response = parse_ai_response(ai_reply_raw)
    logger.info(f"Parsed response. Text: '{parsed_response['textContent'][:100]}...', JSON found: {parsed_response['interactiveJson'] is not None}")

    interactive_element_response = None
    if parsed_response["interactiveJson"]:
        interactive_type = None
        if isinstance(parsed_response["interactiveJson"], dict):
            for key in parsed_response["interactiveJson"]:
                if key in INTERACTIVE_KEYS:
                    interactive_type = INTERACTIVE_KEYS[key]
                    break
        if interactive_type:
            interactive_element_response = {
                "type": interactive_type,
                "data": parsed_response["interactiveJson"]
            }
        else:
            logger.warning(f"Parsed JSON did not contain a known interactive key: {list(parsed_response['interactiveJson'].keys()) if isinstance(parsed_response['interactiveJson'], dict) else 'Not a dict'}")

    final_response = {
        "reply": {
            "textContent": parsed_response["textContent"],
            "interactiveElement": interactive_element_response
        }
    }

    return jsonify(final_response)


# if __name__ == '__main__': ... (lokal körning, oförändrad, men kom ihåg att den inte testar Redis om inte Redis körs lokalt och REDIS_URL är satt)
if __name__ == '__main__':
    # This block is for local development testing only
    from flask import Flask
    from flask_cors import CORS
    from flask_session import Session
    import redis

    app = Flask(__name__)

    # --- Local Dev Session Config ---
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'local-dev-secret')
    local_redis_url = os.getenv('REDIS_URL')
    if local_redis_url:
        try:
            app.config['SESSION_TYPE'] = 'redis'
            app.config['SESSION_REDIS'] = redis.from_url(local_redis_url)
            Session(app)
            print("--- LOCAL DEV: Using REDIS sessions ---")
        except Exception as local_redis_err:
            print(f"--- LOCAL DEV: Failed to connect to Redis ({local_redis_url}), using filesystem sessions: {local_redis_err} ---")
            app.config['SESSION_TYPE'] = 'filesystem'
            app.config['SESSION_FILE_DIR'] = './.flask_session/' # Skapa denna mapp
            if not os.path.exists('./.flask_session'):
                os.makedirs('./.flask_session')
            Session(app)
    else:
        print("--- LOCAL DEV: REDIS_URL not set, using filesystem sessions ---")
        app.config['SESSION_TYPE'] = 'filesystem'
        app.config['SESSION_FILE_DIR'] = './.flask_session/'
        if not os.path.exists('./.flask_session'):
            os.makedirs('./.flask_session')
        Session(app)
    # --------------------------------

    CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*"}}) # Tillåt alla för lokal dev
    app.register_blueprint(ai_bp)

    @app.route('/static/<path:path>')
    def serve_static_local(path):
        static_dir = os.path.join(os.path.dirname(__file__), 'static')
        logger.info(f"Dev server serving static file: {path} from {static_dir}")
        return send_from_directory(static_dir, path)

    port = int(os.environ.get('PORT', 10000))
    static_images_dir_local = os.path.join(os.path.dirname(__file__), 'static', 'images')
    if not os.path.exists(static_images_dir_local):
         os.makedirs(static_images_dir_local, exist_ok=True)
         print(f"Created directory for local dev: {static_images_dir_local}")

    print(f"Starting development server on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=True, threaded=False, processes=1)
