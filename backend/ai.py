"""
Denna modul hanterar AI-integrationen för delegeringsutbildningen.
Modulen bygger dynamiska prompts baserade på användarens bakgrund,
hanterar chatthistorik och kommunicerar med Gemini API.
"""

import os
import json
import logging
import hashlib
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
import google.generativeai as genai

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
    print("Error: GEMINI_API_KEY är inte definierat! Kontrollera din .env-fil.")
else:
    # Konfigurera Gemini API
    genai.configure(api_key=GEMINI_API_KEY)

# Global dictionary för att lagra chatt-sessioner per användare
# Sparas som: {user_name: (session, prompt_hash)}
chat_sessions = {}

# Global promptkonfiguration
admin_prompt_config = [
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
                   
                   "2. För INTERAKTIVA ELEMENT (slutna frågor med svarsalternativ, scenarier, rollspel, matchningsfrågor, etc.): Använd specifika JSON-format som frontend-koden kan tolka. Exempel:\n"
                   "{\n"
                   "  \"text\": \"Vilket av följande påståenden är korrekt angående delegering?\",\n"
                   "  \"suggestions\": [\n"
                   "    {\"label\": \"Delegering gäller i hela Sverige oavsett arbetsplats\", \"value\": \"A\"},\n"
                   "    {\"label\": \"Delegering är kopplad till en specifik arbetsuppgift och arbetsplats\", \"value\": \"B\"}\n"
                   "  ]\n"
                   "}\n\n"
                   
                   "Se till att dina svar ALDRIG har formatet: { \"response\": \"text...\" }. Detta orsakar problem i chatten. Använd antingen ren text ELLER de specifika JSON-formaten för interaktiva element."
    },
    {
        "title": "Pedagogisk variation:",
        "content": "Använd en balanserad mix av olika undervisningsmetoder genom hela utbildningen. Det är VIKTIGT att du varierar din pedagogik för att hålla användaren engagerad och säkerställa effektivt lärande. Växla mellan följande metoder och använd varje metod ungefär lika ofta, använd smileys för att öka den levande känslan:\n\n"
                   
                   "1. Informationsavsnitt med bilder: Presentera tydlig och omfattande information om ett ämne. Använd relevanta bilder där det finns tillgängligt för att illustrera viktiga begrepp. Säkerställ att du ger tillräckliga fakta, begrepp och principer innan du testar kunskapen.\n\n"
                   
                   "2. Öppna reflektionsfrågor: Ställ frågor som uppmuntrar användaren att reflektera och formulera svar med egna ord. Använd dessa för att fördjupa förståelse och uppmuntra kritiskt tänkande. Exempel: 'Hur skulle du agera om...' eller 'Vilka faktorer anser du är viktigast...'. Avsluta med en uppmaning som: 'Skriv ditt svar i rutan nedan.'\n\n"
                   
                   "3. Patientscenarier: Presentera realistiska vårdsituationer där användaren måste tillämpa sin kunskap för att fatta beslut. Se till att använda minst 2-3 olika patientscenarier under utbildningen.\n\n"
                   
                   "4. Rollspelsdialoger: Simulera dialoger mellan olika roller i vården för att visa god kommunikation och samarbete. Använd rollspel minst 2-3 gånger under utbildningen för att visa olika situationer.\n\n"
                   
                   "5. Slutna kunskapsfrågor: Ställ frågor med specifika svarsalternativ för att testa faktakunskap. Variera mellan:\n"
                   "   - Vanliga frågor med några få alternativ\n"
                   "   - Flervalsfrågor där flera svar kan vara korrekta\n"
                   "   - Matchningsfrågor där användaren ska koppla ihop begrepp\n"
                   "   - Ordningsfrågor där steg ska placeras i rätt följd\n\n"
                   
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
                   "Exempel på hur du kan introducera ett scenario:\n"
                   "{\n"
                   "  \"scenario\": {\n"
                   "    \"title\": \"En utmanande situation\",\n"
                   "    \"description\": \"Du kommer till Karin, 78 år, som bor på ett äldreboende. Hon ska ta sin morgonmedicin, men säger att hon känner sig yr och illamående. Du ser i medicinlistan att hon ska ta blodtrycksmedicin och smärtstillande. Vad gör du i denna situation?\",\n"
                   "    \"options\": [\n"
                   "      {\"label\": \"Ge både blodtrycksmedicinen och den smärtstillande som planerat\", \"value\": \"option1\"},\n"
                   "      {\"label\": \"Hoppa över medicineringen helt och hållet\", \"value\": \"option2\"},\n"
                   "      {\"label\": \"Kontakta ansvarig sjuksköterska innan du ger någon medicin\", \"value\": \"option3\"},\n"
                   "      {\"label\": \"Ge bara den smärtstillande men hoppa över blodtrycksmedicinen\", \"value\": \"option4\"}\n"
                   "    ],\n"
                   "    \"correctOption\": \"option3\",\n"
                   "    \"explanation\": \"Vid förändrat allmäntillstånd och symptom som yrsel bör du alltid kontakta ansvarig sjuksköterska innan du ger mediciner, särskilt blodtrycksmediciner som kan förvärra yrsel.\"\n"
                   "  }\n"
                   "}\n\n"
                   "Använd minst 2-3 olika scenarier under utbildningens gång. När användaren svarar, ge detaljerad feedback baserad på deras val och förklara konsekvenserna av deras beslut."
    },
    {
        "title": "Förbättrade frågetyper:",
        "content": "Använd olika typer av slutna frågor för att variera inlärningen och testa användarens kunskap på olika sätt. Växla mellan dessa typer och använd varje typ minst en gång under utbildningen:\n\n"
                   "1. Flervalsfrågor (med ett eller flera korrekta svar):\n"
                   "{\n"
                   "  \"multipleChoice\": {\n"
                   "    \"text\": \"Vilka av följande symptom bör föranleda att du kontaktar sjuksköterska innan du ger blodtrycksmedicin? (Välj alla som stämmer)\",\n"
                   "    \"options\": [\n"
                   "      {\"id\": \"A\", \"text\": \"Yrsel\", \"isCorrect\": true},\n"
                   "      {\"id\": \"B\", \"text\": \"Huvudvärk\", \"isCorrect\": false},\n"
                   "      {\"id\": \"C\", \"text\": \"Svimningskänsla\", \"isCorrect\": true},\n"
                   "      {\"id\": \"D\", \"text\": \"Hosta\", \"isCorrect\": false}\n"
                   "    ],\n"
                   "    \"multiSelect\": true,\n"
                   "    \"explanation\": \"Yrsel och svimningskänsla kan vara tecken på lågt blodtryck, vilket kan förvärras av blodtrycksmediciner.\"\n"
                   "  }\n"
                   "}\n\n"
                   "2. Matchningsfrågor (matcha ihop relaterade koncept):\n"
                   "{\n"
                   "  \"matching\": {\n"
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
                   "}\n\n"
                   "3. Rangordningsfrågor (placera i rätt ordning):\n"
                   "{\n"
                   "  \"ordering\": {\n"
                   "    \"text\": \"Rangordna följande steg i korrekt ordning för att administrera insulin:\",\n"
                   "    \"items\": [\n"
                   "      {\"id\": \"1\", \"text\": \"Kontrollera patientens identitet\", \"correctPosition\": 1},\n"
                   "      {\"id\": \"2\", \"text\": \"Tvätta händerna noggrant\", \"correctPosition\": 0},\n"
                   "      {\"id\": \"3\", \"text\": \"Kontrollera insulindosen mot ordinationen\", \"correctPosition\": 2},\n"
                   "      {\"id\": \"4\", \"text\": \"Administrera insulinet\", \"correctPosition\": 3},\n"
                   "      {\"id\": \"5\", \"text\": \"Dokumentera administreringen\", \"correctPosition\": 4}\n"
                   "    ]\n"
                   "  }\n"
                   "}\n\n"
                   "4. Standard slutna frågor med några få alternativ:\n"
                   "{\n"
                   "  \"text\": \"Vem bär det yttersta ansvaret för en delegerad arbetsuppgift?\",\n"
                   "  \"suggestions\": [\n"
                   "    {\"label\": \"Undersköterskan som utför uppgiften\", \"value\": \"Undersköterskan som utför uppgiften\"},\n"
                   "    {\"label\": \"Sjuksköterskan som delegerat uppgiften\", \"value\": \"Sjuksköterskan som delegerat uppgiften\"},\n"
                   "    {\"label\": \"Verksamhetschefen\", \"value\": \"Verksamhetschefen\"}\n"
                   "  ]\n"
                   "}\n\n"
                   "Fördela dessa olika frågetyper jämnt genom utbildningen."
    },
    {
        "title": "Socialt lärande och rollspel:",
        "content": "Använd dialoger mellan olika roller i vårdsituationer för att hjälpa användaren förstå interaktioner och kommunikation inom vården. Dessa simuleringar är särskilt värdefulla för att visa praktiska tillämpningar av teoretiska begrepp. Inkludera rollspel minst 2-3 gånger under utbildningen.\n\n"
                   "Roller att inkludera:\n"
                   "1. Sjuksköterska: Fokusera på ansvar, delegation, bedömningar och medicinska beslut\n"
                   "2. Patient: Illustrera olika patientbeteenden, behov och kommunikationsstilar\n"
                   "3. Läkare: Visa ordinationer, medicinska bedömningar och teamarbete\n"
                   "4. Annan vårdpersonal: Visa samarbete och informationsutbyte\n\n"
                   "Exempel på hur du kan implementera rollspel i dialogen:\n"
                   "{\n"
                   "  \"roleplay\": {\n"
                   "    \"title\": \"Kommunikation med ansvarig sjuksköterska\",\n"
                   "    \"scenario\": \"Du behöver rapportera en avvikelse till sjuksköterskan. Följande dialog visar en bra kommunikationsmodell med SBAR.\",\n"
                   "    \"dialogue\": [\n"
                   "      {\"role\": \"Undersköterska (du)\", \"message\": \"Hej Sara, jag behöver rapportera något om Sven i rum 315.\"},\n"
                   "      {\"role\": \"Sjuksköterska Sara\", \"message\": \"Hej! Vad gäller det?\"},\n"
                   "      {\"role\": \"Undersköterska (du)\", \"message\": \"Situation: Sven fick inte sin Waran-tablett klockan 08 i morse. Bakgrund: Han är ordinerad 2.5mg dagligen. Analys: Jag upptäckte felet när jag dokumenterade klockan 10. Rekommendation: Jag tänker att vi behöver kontakta läkaren för att fråga om han ska ta den nu eller vänta till imorgon.\"},\n"
                   "      {\"role\": \"Sjuksköterska Sara\", \"message\": \"Tack för en tydlig rapport. Du använder SBAR-modellen perfekt, vilket gör det lätt för mig att förstå situationen. Jag kontaktar läkaren direkt.\"}\n"
                   "    ],\n"
                   "    \"learningPoints\": [\n"
                   "      \"SBAR är ett effektivt kommunikationsverktyg i vården\",\n"
                   "      \"Var specifik med information om patient, medicin och dosering\",\n"
                   "      \"Inkludera alltid en rekommendation när du rapporterar problem\"\n"
                   "    ]\n"
                   "  }\n"
                   "}\n\n"
                   "Använd dessa dialoger för att illustrera god kommunikation, professionella interaktioner, och hur man hanterar utmanande situationer i vårdmiljön."
    },
    {
        "title": "Nyanserad feedback:",
        "content": "Ge detaljerad och specifik feedback baserad på typen av fel användaren gör:\n\n"
                   "1. Kunskapsfel: När användaren visar brist på faktakunskap, ge korrekt information och förklara varför det är viktigt\n"
                   "2. Procedurfel: När användaren gör fel i processer eller ordningsföljder, förklara stegen i detalj\n"
                   "3. Prioriteringsfel: När användaren prioriterar fel, förklara riskbedömning och beslutsfattande\n"
                   "4. Säkerhetsfel: När användaren gör val som kan äventyra patientsäkerheten, betona konsekvenserna och alternativa handlingar\n\n"
                   "Feedback ska alltid vara konstruktiv och koppla tillbaka till relevanta lärandemål. Den ska ges i ett stödjande sätt som uppmuntrar till fortsatt lärande. Anpassa feedbackens ton efter allvarlighetsgraden i felet - var mer direkt vid säkerhetsrisker och mer uppmuntrande vid mindre misstag.\n\n"
                   "Exempel på nyanserad feedback:\n"
                   "{\n"
                   "  \"feedback\": {\n"
                   "    \"type\": \"safety\",\n"
                   "    \"userAnswer\": \"Ge medicinen ändå\",\n"
                   "    \"message\": \"Det här valet skulle kunna utgöra en patientsäkerhetsrisk. När en patient uppvisar nya symptom som yrsel före administrering av blodtrycksmedicin är det viktigt att kontakta sjuksköterska eftersom:\",\n"
                   "    \"points\": [\n"
                   "      \"Blodtrycksmedicin kan förvärra yrsel om patienten redan har lågt blodtryck\",\n"
                   "      \"Situationen kräver en medicinsk bedömning som ligger utanför din delegering\",\n"
                   "      \"Patientens förändrade tillstånd kan vara tecken på något som kräver omedelbar medicinsk uppmärksamhet\"\n"
                   "    ],\n"
                   "    \"correctAction\": \"Kontakta alltid ansvarig sjuksköterska vid förändrat allmäntillstånd innan du ger ordinerade läkemedel.\"\n"
                   "  }\n"
                   "}"
    },
    {
        "title": "Användning av bilder:",
        "content": "Inkludera relevanta bilder när du presenterar information för att förstärka inlärningen. Bilder är särskilt effektiva för att illustrera:\n\n"
                   "1. Procedurer och processer (t.ex. SBAR-kommunikation, delegeringsprocessen)\n"
                   "2. Fysiska objekt (t.ex. läkemedelsformer, medicinsk utrustning)\n"
                   "3. Konceptuella diagram (t.ex. ansvarsstrukturer, dokumentationsflöden)\n\n"
                   "När du refererar till en bild, koppla den tydligt till informationen du presenterar och förklara vad bilden visar. Exempel:\n"
                   "\"För att förenkla kommunikationen med sjuksköterskor används ofta SBAR-modellen. SBAR är en strukturerad kommunikationsmetod med fyra komponenter: Situation, Bakgrund, Aktuellt tillstånd och Rekommendation. Se bilden nedan för en illustration av SBAR-modellen och hur den används i praktiken.\"\n\n"
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
        "content": "Vid fel svar: Ge kort korrigerande feedback baserad på typen av fel (kunskapsfel, procedurfel, prioriteringsfel, eller säkerhetsfel) och be användaren försöka igen med de klickbara alternativen, ge också användaren alternativen igen.\n"
                   "Vid rätt svar: Bekräfta användarens rätta svar, förstärk den viktigaste lärdomen, och gå samtidigt vidare till nästa del.\n"
    },
    {
        "title": "Övriga viktiga överväganden:",
        "content": "Varje meddelande som skickas ska avslutas med en uppmaning om att användaren ska använda rutan nedanför att svara på frågan alternativ klicka på knapparna för att svara. Nämn aldrig att du generar något via JSON format. Om användaren försöker byta ämne så är du trevlig men ser till att återgå till utbildningen. När du känner det lämpligt kan du använda kunskapsfrågor även för att ställa sant/falskt frågor eller fråga om användaren är redo att gå vidare eller om hen vill att du förklarar mer.\n"
                   "Integrera de olika inlärningsteknikerna (scenarier, olika frågetyper, rollspel) naturligt genom utbildningen för att skapa en varierad och engagerande upplevelse. Anpassa svårighetsgraden baserat på användarens tidigare kunskaper och svar.\n"
    },
    {
        "title": "Avslutning:",
        "content": "Innan du avslutar utbildningen ska du generera alla de frågor som användaren har svarat fel på minst en gång tidigare i utbildningen. När du gått igenom hela utbildningen och genererat uppföljningsfrågor med användaren och när användaren har visat förståelse för alla moment, ge en sammanfattning av allt ni gått igenom och tacka för visat intresse.\n"
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

# Define local image assets.
# Placera dina PNG-bilder i mappen "static/images" i projektets rot.
image_assets = {
    "image1": {
         "url": "http://localhost:5000/static/images/image1.png",
         "description": "Denna bild illustrerar SBAR, använd i samband med att du förklarar det"
    },
    "image2": {
         "url": "http://localhost:5000/static/images/image2.png",
         "description": "Beskrivning av bild 2"
    },
    "image3": {
         "url": "http://localhost:5000/static/images/image3.png",
         "description": "Beskrivning av bild 3"
    },
    "image4": {
         "url": "http://localhost:5000/static/images/image4.png",
         "description": "Beskrivning av bild 4"
    },
    "image5": {
         "url": "http://localhost:5000/static/images/image5.png",
         "description": "Beskrivning av bild 5"
    },
    "image6": {
         "url": "http://localhost:5000/static/images/image6.png",
         "description": "Beskrivning av bild 6"
    },
    "image7": {
         "url": "http://localhost:5000/static/images/image7.png",
         "description": "Beskrivning av bild 7"
    },
    "image8": {
         "url": "http://localhost:5000/static/images/image8.png",
         "description": "Beskrivning av bild 8"
    },
    "image9": {
         "url": "http://localhost:5000/static/images/image9.png",
         "description": "Beskrivning av bild 9"
    },
    "image10": {
         "url": "http://localhost:5000/static/images/image10.png",
         "description": "Beskrivning av bild 10"
    },
    "image11": {
         "url": "http://localhost:5000/static/images/image11.png",
         "description": "Beskrivning av bild 11"
    },
    "image12": {
         "url": "http://localhost:5000/static/images/image12.png",
         "description": "Beskrivning av bild 12"
    },
    "image13": {
         "url": "http://localhost:5000/static/images/image13.png",
         "description": "Beskrivning av bild 13"
    },
    "image14": {
         "url": "http://localhost:5000/static/images/image14.png",
         "description": "Beskrivning av bild 14"
    }
}


def get_prompt_hash():
    """Returnerar ett hashvärde för den aktuella admin_prompt_config."""
    prompt_json = json.dumps(admin_prompt_config, sort_keys=True)
    return hashlib.md5(prompt_json.encode('utf-8')).hexdigest()


def build_background(user_answers):
    """
    Bygger dynamisk bakgrund baserat på användarens svar.
    
    Args:
        user_answers: Användarens svar på bakgrundsfrågor
        
    Returns:
        En formaterad textsträng med anpassad bakgrundsinformation
    """
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
    """
    Läser in utbildningsplanen från en extern fil.
    
    Returns:
        Innehållet i utbildningsplanen som textsträng
    """
    try:
        with open("education_plan.txt", "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error("Kunde inte läsa utbildningsplanen: %s", e)
        return "Utbildningsplan saknas eller kunde inte laddas."


def build_system_instruction(user_answers):
    """
    Bygger systeminstruktionen genom att kombinera adminkonfigurerade sektioner 
    med dynamisk bakgrund, utbildningsplan och lokala bildresurser.
    
    Args:
        user_answers: Användarens svar på bakgrundsfrågor
        
    Returns:
        En komplett systeminstruktion för AI-modellen
    """
    background_text = build_background(user_answers)
    education_plan_text = load_education_plan()
    instruction_parts = []
    
    for section in admin_prompt_config:
        content = section["content"]
        if "{background}" in content:
            content = content.replace("{background}", background_text)
        if "{education_plan}" in content:
            content = content.replace("{education_plan}", education_plan_text)
        if section["title"]:
            instruction_parts.append(f"**{section['title']}** {content}")
        else:
            instruction_parts.append(content)
    
    system_instruction = "\n".join(instruction_parts)
    
    # Ersätt bildplatshållare med faktiska lokala bildlänkar i markdown-format
    for key, asset in image_assets.items():
        placeholder = "{" + key + "}"
        replacement = f"![{asset['description']}]({asset['url']})"
        system_instruction = system_instruction.replace(placeholder, replacement)
    
    return system_instruction


def build_initial_history(user_answers, user_message, user_name):
    """
    Bygger initial historik med en välkomsttext anpassad utifrån användarens bakgrund.
    
    Args:
        user_answers: Användarens svar på bakgrundsfrågor
        user_message: Användarens första meddelande
        user_name: Användarens namn
        
    Returns:
        En lista med meddelandeobjekt för första konversationen
    """
    greeting = f"Välkommen {user_name} till delegeringsutbildningen!\n"
    greeting += "Jag är din lärare, du kan kalla mig Lexi. I denna utbildningen fokuserar vi på **läkemedelstilldelning via delegering**, för dig som jobbar i Skövde kommun.\n\n"
    
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
    
    # Format för Gemini API
    history = [{
        "role": "user",
        "parts": [{
            "text": greeting
        }]
    }]
    
    return history


def is_valid_interactive_json(text):
    """
    Kontrollerar om svaret innehåller ett giltigt interaktivt JSON-format som frontend kan hantera.
    
    Args:
        text: Texten som ska kontrolleras
    
    Returns:
        True om texten innehåller ett giltigt interaktivt JSON-format, annars False
    """
    try:
        data = json.loads(text)
        # Kontrollera om det är ett giltigt format som innehåller någon av de förväntade nycklarna
        valid_formats = ["text", "suggestions", "scenario", "roleplay", 
                        "multipleChoice", "matching", "ordering", "feedback"]
        
        return isinstance(data, dict) and any(key in data for key in valid_formats)
    except json.JSONDecodeError:
        return False
    except:
        return False


def fix_ai_response(response_text):
    """
    Fixar AI-svar som har felaktiga format, särskilt svar som är inkapslat i {"response": "text"} format.
    
    Args:
        response_text: Originalsvaret från AI:n
    
    Returns:
        Korrigerat svar
    """
    # Försök identifiera och åtgärda {"response": "text"} format
    try:
        data = json.loads(response_text)
        if isinstance(data, dict) and "response" in data and isinstance(data["response"], str):
            # Detta är det felaktiga formatet, extrahera bara texten
            return data["response"]
    except json.JSONDecodeError:
        pass  # Inte ett JSON-format, fortsätt med originalet
    except:
        pass  # Annan typ av fel, fortsätt med originalet
    
    # Kolla om texten är ett giltigt interaktivt JSON-format
    if is_valid_interactive_json(response_text):
        return response_text
    
    # Om texten börjar med { men inte är ett giltigt interaktivt JSON-format,
    # försök extrahera ren text
    if response_text.strip().startswith("{") and response_text.strip().endswith("}"):
        try:
            data = json.loads(response_text)
            # Om vi kom hit är det ett JSON-objekt men inte ett av våra format
            # Leta efter textfält
            text_fields = []
            for key, value in data.items():
                if isinstance(value, str) and len(value) > 10:  # Antar att ett längre textfält är innehållsfältet
                    text_fields.append(value)
            
            if text_fields:
                return "\n\n".join(text_fields)
        except:
            pass
    
    # Returnera originalet om inga åtgärder gjordes
    return response_text


@ai_bp.route('/api/chat', methods=['POST'])
def chat():
    """
    Huvudendpoint för chattfunktionen. Hanterar användarmeddelanden och genererar AI-svar.
    """
    data = request.get_json()
    user_answers = data.get('answers', {})
    user_message = data.get('message', '')
    user_name = data.get('name', 'Användare')

    # Räkna ut det aktuella hashvärdet för prompt-konfigurationen
    current_hash = get_prompt_hash()

    # Hantera start-meddelandet separat (alltid skapa en ny session)
    if user_message.strip().lower() == "start":
        history = build_initial_history(user_answers, user_message, user_name)
        try:
            # Bygg system instruction
            system_instruction_text = build_system_instruction(user_answers)
            
            # Skapa en generativ modell med rätt konfiguration
            model = genai.GenerativeModel(
                model_name='gemini-2.0-flash',
                system_instruction=system_instruction_text,
                generation_config={
                    "temperature": 1,
                    "top_p": 0.95,
                    "top_k": 40,
                    "max_output_tokens": 8192
                }
            )
            
            # Starta en chatt med modellen
            session = model.start_chat(history=history)
            
            # Spara sessionen tillsammans med det aktuella hashvärdet
            chat_sessions[user_name] = (session, current_hash)
        except Exception as e:
            logger.error("Fel vid skapande av chatt-session: %s", e)
            return jsonify({"error": "Kunde inte skapa chatt-session"}), 500
            
        initial_greeting = history[0]["parts"][0]["text"]
        return jsonify({"reply": initial_greeting})

    # Om en session redan existerar, kontrollera om den nuvarande prompt-konfigurationen har ändrats
    session_tuple = chat_sessions.get(user_name)
    if session_tuple:
        session, session_prompt_hash = session_tuple
        if session_prompt_hash != current_hash:
            # Prompten har uppdaterats – skapa en ny session med den nya konfigurationen
            history = build_initial_history(user_answers, user_message, user_name)
            try:
                # Bygg system instruction
                system_instruction_text = build_system_instruction(user_answers)
                
                # Skapa en generativ modell med rätt konfiguration
                model = genai.GenerativeModel(
                    model_name='gemini-2.0-flash',
                    system_instruction=system_instruction_text,
                    generation_config={
                        "temperature": 1,
                        "top_p": 0.95,
                        "top_k": 40,
                        "max_output_tokens": 8192
                    }
                )
                
                # Starta en chatt med modellen
                session = model.start_chat(history=history)
                
                # Spara sessionen tillsammans med det aktuella hashvärdet
                chat_sessions[user_name] = (session, current_hash)
            except Exception as e:
                logger.error("Fel vid skapande av chatt-session: %s", e)
                return jsonify({"error": "Kunde inte skapa chatt-session"}), 500
    else:
        # Ingen session finns – skapa en ny
        history = build_initial_history(user_answers, user_message, user_name)
        try:
            # Bygg system instruction
            system_instruction_text = build_system_instruction(user_answers)
            
            # Skapa en generativ modell med rätt konfiguration
            model = genai.GenerativeModel(
                model_name='gemini-2.0-flash',
                system_instruction=system_instruction_text,
                generation_config={
                    "temperature": 1,
                    "top_p": 0.95,
                    "top_k": 40,
                    "max_output_tokens": 8192
                }
            )
            
            # Starta en chatt med modellen
            session = model.start_chat(history=history)
            
            # Spara sessionen tillsammans med det aktuella hashvärdet
            chat_sessions[user_name] = (session, current_hash)
        except Exception as e:
            logger.error("Fel vid skapande av chatt-session: %s", e)
            return jsonify({"error": "Kunde inte skapa chatt-session"}), 500

    # Skicka användarens meddelande
    try:
        # Använd det nya API:et för att skicka meddelande
        response = session.send_message(content=user_message)
        
        # Hämta textinnehållet från svaret
        text_parts = [part.text for part in response.parts if hasattr(part, 'text') and part.text]
        ai_reply = "\n".join(text_parts).strip() if text_parts else ""
        
        # Fixa eventuella problem med svarsformateringen
        ai_reply = fix_ai_response(ai_reply)
        
    except Exception as e:
        logger.error("Fel vid Gemini API-anrop: %s", e)
        ai_reply = "Fel vid anrop till AI API. Var god försök igen senare."

    return jsonify({"reply": ai_reply})


@ai_bp.route('/api/admin/prompt', methods=['GET', 'POST'])
def admin_prompt():
    """
    Endpoint för att hantera redigering av systemprompt via ett UI under test-/utvecklingsfasen
    """
    global admin_prompt_config
    
    if request.method == 'GET':
        return jsonify({"prompt_config": admin_prompt_config})
    
    elif request.method == 'POST':
        data = request.get_json()
        if not data or "prompt_config" not in data:
            return jsonify({"error": "Ogiltig data, förväntar 'prompt_config'"}), 400
            
        # Förvänta att data["prompt_config"] är en lista av sektioner med 'title' och 'content'
        try:
            new_config = data["prompt_config"]
            
            # Enkel validering
            if not isinstance(new_config, list):
                return jsonify({"error": "'prompt_config' ska vara en lista"}), 400
                
            for section in new_config:
                if not isinstance(section, dict) or "title" not in section or "content" not in section:
                    return jsonify({"error": "Varje sektion ska vara ett objekt med 'title' och 'content'"}), 400
                    
            admin_prompt_config = new_config
            
            # Rensa chat_sessions så att ny systemprompt används för nya sessioner
            global chat_sessions
            chat_sessions = {}
            
            return jsonify({
                "message": "Prompt configuration updated successfully", 
                "prompt_config": admin_prompt_config
            })
            
        except Exception as e:
            logger.error("Fel vid uppdatering av prompt configuration: %s", e)
            return jsonify({"error": "Kunde inte uppdatera prompt configuration"}), 500


if __name__ == '__main__':
    from flask import Flask
    from flask_cors import CORS
    import os
    
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(ai_bp)
    
    # Använd PORT miljövariabeln för Render eller 5000 som standard
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
