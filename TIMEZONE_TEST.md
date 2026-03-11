# Timezone Test Instructies

## Probleem
Tijden worden mogelijk nog steeds 1 uur te laat weergegeven.

## Test Procedure

### Test 1: Nieuw Event Aanmaken
1. Ga naar SuperAdmin
2. Maak een NIEUW event aan
3. Vul als Event Start tijd in: **21:30**
4. Sla het event op
5. Ga naar de Agenda pagina
6. Controleer: staat er **21:30** of **22:30**?

**Verwacht resultaat:** Moet exact **21:30** tonen

### Test 2: Bestaand Event Bewerken
1. Ga naar SuperAdmin
2. Open een BESTAAND event (bijv. "All Stars Night")
3. Bekijk de starttijd in het formulier
4. **Belangrijk:** Noteer de tijd die je ziet
5. Klik "Opslaan" ZONDER iets te wijzigen
6. Ga naar Agenda en bekijk het event

**Waarschuwing:** Events die vóór de timezone fix waren opgeslagen hebben mogelijk verkeerde UTC waarden in de database. Deze moeten handmatig worden gecorrigeerd.

## Debug Informatie Verzamelen

Open de browser Developer Tools (F12) en ga naar de Console tab.

### Bij het bewerken van een event:
Typ in de console:
```javascript
// Bekijk de ruwe event data
fetch('https://zmoorddmgtkynvvthdod.supabase.co/rest/v1/events?select=*&id=eq.EVENT_ID_HIER', {
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptb29yZGRtZ3RreW52dnRoZG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MTI5NjAsImV4cCI6MjA3ODI4ODk2MH0.7c0pYq6c82pehGuX6prkhXzYUgodUSJvsRR3BVV68NM'
  }
}).then(r => r.json()).then(console.log)
```

Let op:
- `start_date` waarde in database (UTC)
- Tijd getoond in datetime-local input
- Tijd getoond op Agenda pagina

## Veelvoorkomende Problemen

### Probleem 1: Browser Timezone
**Symptoom:** Tijden kloppen op je laptop maar niet op een andere computer

**Oorzaak:** De browser/computer staat ingesteld op een andere timezone dan Europe/Brussels

**Oplossing:** Mijn code zou dit automatisch moeten afhandelen met `timeZone: 'Europe/Brussels'`. Als het niet werkt, laat me weten.

### Probleem 2: Oude Event Data
**Symptoom:** Nieuwe events tonen correct, oude events fout

**Oorzaak:** Events die voor de fix werden opgeslagen hebben verkeerde UTC waarden

**Oplossing:**
1. Elk oud event opnieuw opslaan in SuperAdmin
2. Of ik kan een database migratie script schrijven om alle times te corrigeren

### Probleem 3: DST (Daylight Saving Time)
**Symptoom:** Tijden kloppen in winter maar niet in zomer (of andersom)

**Oorzaak:** Europe/Brussels wisselt tussen UTC+1 (winter) en UTC+2 (zomer)

**Oplossing:** Mijn code gebruikt `toLocaleString` met `timeZone: 'Europe/Brussels'` wat dit automatisch zou moeten afhandelen.

## Wat te Doen

**Geef me alsjeblieft:**
1. Is dit een NIEUW event of een OUD event?
2. Welke tijd vulde je in SuperAdmin in?
3. Welke tijd zie je op de Agenda pagina?
4. Screenshot van de browser console (F12) wanneer je het event opslaat

Dan kan ik precies zien waar het fout gaat en het oplossen.

## Snelle Fix Voor Alle Oude Events

Als blijkt dat het alleen oude events zijn, kan ik een script schrijven dat:
1. Alle events uit de database haalt
2. De huidige `start_date` interpreteert als Brussels tijd (in plaats van UTC)
3. Correct converteert naar UTC
4. Database update

Dit zou alle oude events in één keer fixen.
