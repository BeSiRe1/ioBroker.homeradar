# HomeRadar for ioBroker

HomeRadar detects locally whether configured people are at home or at other frequently visited places. It can optionally calculate the driving time from each person's current location to home using public routing services. When enabled, Geoapify can also resolve each person's current coordinates into an address.

For routing and address details, see the [OSRM HTTP API documentation](https://project-osrm.org/docs/v26.4.0/http) and Geoapify documentation for [route matrices](https://apidocs.geoapify.com/docs/route-matrix/) and [reverse geocoding](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

## Features

- Configure any number of people using existing latitude and longitude states in ioBroker.
- Configure any number of named places with individual detection radii.
- Detect presence at home and at other configured places using local coordinate calculations.
- Show each person's current coordinates and a locally generated OpenStreetMap link.
- Calculate the driving time from each person's current location to home; optionally use Geoapify as a fallback when OSRM fails.
- Set an individual address refresh distance for each person, defaulting to 100 meters; smaller values cause more Geoapify lookups and use more credits.
- Check all people once at startup, then update only a person whose coordinates change.
- Cache each person's home route until their location changes by at least 30 meters.
- Optionally configure a distance and travel-time fallback from each place to home. These values are only used if online routing fails while a person is detected at that place.
- Set the travel time home to zero locally when a person is within the home radius; no routing request is needed at home.
- Show a central home-presence summary with a boolean, person count, and names.
- Show each person's presence, current place, distances, travel times, and route calculation status in the ioBroker object tree.
- Manually refresh one person's address and home route with a writable button state.
- Count successful and failed OSRM and Geoapify requests, keep today's counters as individual states, and append each day's totals to one JSON history state indefinitely.

## Object structure

The adapter creates states at these paths:

```text
summary
├─ anyoneHome              whether at least one person is home
├─ homeCount               number of people currently home
└─ peopleAtHome            comma-separated names of people at home

persons.<personId>
├─ refresh                  writable trigger to refresh this person's address and home route
├─ location
│  ├─ coordinates
│  │  ├─ latitude           current latitude
│  │  └─ longitude          current longitude
│  ├─ map
│  │  └─ openStreetMapUrl   link to the person's current location
│  └─ address               address fields from Geoapify, when configured
│     ├─ addressLine         composed address line
│     ├─ formatted           full formatted address
│     ├─ street              street (plus available address components)
│     ├─ housenumber         house number
│     ├─ status              address lookup status
│     ├─ lastUpdate          time of the last successful address lookup
│     └─ response            complete Geoapify response as JSON
├─ presence
│  ├─ isHome                 whether the person is within the home radius
│  ├─ currentPlace           detected place, or unterwegs
│  └─ lastUpdate             time of the last coordinate evaluation
├─ places.<placeId>
│  ├─ inside                 whether the person is within the place radius
│  └─ distance               straight-line distance in meters
└─ travelTime.home
   ├─ minutes                estimated driving time home
   ├─ distance               route length to home in kilometers
   ├─ combined               rounded distance and time, e.g. 39km / 32min
   ├─ lastUpdate             time of the last successful route result update
   └─ status                 route calculation or cache status

apiUsage
├─ today
│  ├─ date
│  ├─ osrm.routing.successful / failed
│  └─ geoapify
│     ├─ routing.successful / failed
│     ├─ addressLookup.successful / failed
│     └─ credits
└─ history                   JSON array; one record per day, appended at 23:59 and retained indefinitely
```

Each `apiUsage.history` record contains `date`, successful and failed OSRM requests, successful and failed Geoapify routing and address lookups, and Geoapify credits. The adapter appends the day's totals at 23:59 and updates that date's record at midnight to include requests made during the final minute. Existing per-day history states are migrated into this JSON array when the adapter starts.

Travel-time states exist only for the route home. When a person is within the home radius, the travel time and distance are set to zero locally. All people are checked once at startup. Afterwards, only a person whose coordinates change is updated. After a successful request, the route is reused until that person's location changes by at least 30 meters from the last successful route query. If routing fails and the person is inside a configured place with both fallback values set, the adapter uses that place's fallback distance and travel time. After an error, HomeRadar tries again on the next coordinate change or adapter restart.

The route distances follow the route selected by the routing service. With the public OSRM table service, this is the fastest route and not necessarily the shortest road route. The distance and travel time therefore describe the same fastest route.

Presence and straight-line distance calculations are local. Home-route requests send the person's current coordinates and the home coordinates to the routing service. When Geoapify address lookup is enabled, the person's current coordinates are also sent to Geoapify when the per-person refresh distance is reached.

The OpenStreetMap link is generated locally; the browser sends the coordinates to OpenStreetMap only when the link is opened.

Write `true` to `persons.<personId>.refresh` to force an address lookup and home-route update for that person, bypassing the movement-distance caches. Address lookup and routing still need to be enabled. The trigger resets to `false` automatically. The address and route `lastUpdate` states show the time of the last successful result update.

## Setup

1. In the adapter instance settings, add each person, select their existing latitude and longitude states, and set the address refresh distance (100 meters by default).
2. Add the places you want to monitor, including their coordinates and detection radii. Optionally enter both fallback values for the journey from a place to home. Mark one place as home. Selecting a different home place clears the previous selection.
3. Enable travel time calculation and select an OSRM server. The public OSRM demo server is preconfigured.
4. Choose independently whether to use Geoapify as a routing fallback and whether to resolve addresses. Both options use the Geoapify API key.
No example people, places, personal coordinates, or coordinate datapoint IDs are preconfigured. Add the people and places you want to use in the instance settings.

## Geoapify API key

Enter a Geoapify API key in the instance settings. The separate options determine whether HomeRadar uses Geoapify for address lookup, as an OSRM routing fallback, or both. Both options are independently configurable.

1. [Create a free Geoapify account and project](https://myprojects.geoapify.com/).
2. Copy the project API key from **API Keys**.
3. Enter it in the HomeRadar instance settings under **Travel times**.

The [Geoapify free plan](https://www.geoapify.com/pricing-details/) currently includes 3,000 credits per day. A reverse-geocoding request costs one credit. The home route uses a 1×1 matrix; its baseline cost is one credit, plus any documented distance surcharge. The adapter tracks today's credits from successful Geoapify responses and counts failed calls separately. This is HomeRadar's usage, not an account-wide total. The address lookup is repeated after the movement distance configured for that person is reached (100 meters by default). Smaller values cause more address lookups and consume more credits. Street and house number are shown only when Geoapify's returned address is within 100 meters of the person's coordinates; other locality fields remain available. The full raw response remains available for inspection. Geoapify routing provides free-flow or approximated traffic, not live traffic. The API key is stored as a protected, encrypted adapter setting.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for changes by version.

## Development

Requirement: Node.js 20 or newer.

```sh
npm install
npm test
```

## License

MIT. See [LICENSE](LICENSE).

---

# HomeRadar für ioBroker

HomeRadar erkennt lokal, ob sich konfigurierte Personen zu Hause oder an anderen häufig besuchten Orten befinden. Über öffentliche Routingdienste berechnet der Adapter optional die Fahrzeit vom aktuellen Standort jeder Person nach Hause. Wenn aktiviert, kann Geoapify außerdem die aktuellen Koordinaten jeder Person in eine Adresse auflösen.

Weitere Informationen findest du in der [OSRM-HTTP-API-Dokumentation](https://project-osrm.org/docs/v26.4.0/http) sowie in der Geoapify-Dokumentation für [Routenmatrizen](https://apidocs.geoapify.com/docs/route-matrix/) und [Adressauflösung](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

## Funktionen

- Beliebig viele Personen über vorhandene ioBroker-Datenpunkte für Breiten- und Längengrad einrichten.
- Beliebig viele benannte Orte mit individuellem Erkennungsradius einrichten.
- Anwesenheit zu Hause und an anderen konfigurierten Orten anhand der Koordinaten lokal erkennen.
- Aktuelle Koordinaten jeder Person und einen lokal erzeugten OpenStreetMap-Link anzeigen.
- Die Fahrzeit vom aktuellen Standort jeder Person nach Hause berechnen; Geoapify optional als Fallback verwenden, wenn OSRM ausfällt.
- Je Person festlegen, ab welcher Standortänderung die Adresse erneut bei Geoapify abgefragt wird; voreingestellt sind 100 Meter. Kleinere Werte verbrauchen mehr Credits.
- Alle Personen beim Start einmal prüfen und danach nur die Person aktualisieren, deren Koordinaten sich ändern.
- Die Heimroute jeder Person zwischenspeichern, bis sich ihr Standort mindestens 30 Meter verändert hat.
- Für jeden Ort optional Entfernung und Fahrzeit von dort nach Hause als Fallback hinterlegen. Diese Werte werden nur genutzt, wenn das Online-Routing fehlschlägt und die Person innerhalb des Erkennungsradius dieses Ortes erkannt wird.
- Die Fahrzeit nach Hause lokal auf null setzen, wenn sich eine Person innerhalb des Zuhause-Radius befindet; dafür wird keine Routenanfrage benötigt.
- Eine zentrale Anwesenheitsübersicht mit Boolean, Personenanzahl und Namen der anwesenden Personen anzeigen.
- Anwesenheit, aktuellen Ort, Entfernungen, Fahrzeiten und den Status der Routenberechnung im ioBroker-Datenpunktbaum anzeigen.
- Adresse und Heimroute einer Person über einen schreibbaren Datenpunkt manuell aktualisieren.
- Erfolgreiche und fehlgeschlagene OSRM- und Geoapify-Aufrufe zählen, die heutigen Zähler als einzelne Datenpunkte anzeigen und die Tageswerte dauerhaft in einem JSON-Datenpunkt sammeln.

## Datenpunktstruktur

Der Adapter legt Datenpunkte unter folgenden Pfaden an:

```text
summary
├─ anyoneHome              mindestens eine Person ist zu Hause
├─ homeCount               Anzahl der Personen zu Hause
└─ peopleAtHome            durch Komma getrennte Namen der Personen zu Hause

persons.<personId>
├─ refresh                  schreibbarer Auslöser für Adresse und Heimroute dieser Person
├─ location
│  ├─ coordinates
│  │  ├─ latitude           aktueller Breitengrad
│  │  └─ longitude          aktueller Längengrad
│  ├─ map
│  │  └─ openStreetMapUrl   Link zum aktuellen Standort der Person
│  └─ address               Geoapify-Adressdaten, falls konfiguriert
│     ├─ addressLine         zusammengesetzte Adresszeile
│     ├─ formatted           formatierte vollständige Adresse
│     ├─ street              Straße (sowie verfügbare Adressbestandteile)
│     ├─ housenumber         Hausnummer
│     ├─ status              Status der Adressauflösung
│     ├─ lastUpdate          Zeitpunkt der letzten erfolgreichen Adressabfrage
│     └─ response            vollständige Geoapify-Antwort als JSON
├─ presence
│  ├─ isHome                 Person befindet sich im Radius von Zuhause
│  ├─ currentPlace           erkannter Ort oder unterwegs
│  └─ lastUpdate             Zeitpunkt der letzten Koordinatenprüfung
├─ places.<placeId>
│  ├─ inside                 Person befindet sich innerhalb des Ortsradius
│  └─ distance               Luftlinienentfernung in Metern
└─ travelTime.home
   ├─ minutes                geschätzte Fahrzeit nach Hause
   ├─ distance               Streckenlänge nach Hause in Kilometern
   ├─ combined               gerundete Entfernung und Fahrzeit, z. B. 39km / 32min
   ├─ lastUpdate             Zeitpunkt des letzten erfolgreichen Fahrzeitergebnisses
   └─ status                 Status der Routenberechnung oder des Caches

apiUsage
├─ today
│  ├─ osrm.routing.successful / failed
│  └─ geoapify
│     ├─ routing.successful / failed
│     ├─ addressLookup.successful / failed
│     └─ credits
└─ history                   JSON-Array; Tageswerte werden um 23:59 angehängt und dauerhaft gespeichert
```

Jeder Eintrag in `apiUsage.history` enthält `date`, erfolgreiche und fehlgeschlagene OSRM-Aufrufe, erfolgreiche und fehlgeschlagene Geoapify-Routen- und Adressabfragen sowie Geoapify-Credits. Der Adapter hängt die Tageswerte um 23:59 an und aktualisiert diesen Tageseintrag um Mitternacht, damit auch Aufrufe aus der letzten Minute enthalten sind. Vorhandene datumsbezogene History-Datenpunkte werden beim Start in dieses JSON übernommen. Die Historie wird nicht automatisch gekürzt.

Unter `travelTime` gibt es nur die Route nach Hause. Befindet sich eine Person innerhalb des Zuhause-Radius, werden Fahrzeit und Entfernung lokal auf null gesetzt. `combined` zeigt Entfernung und Fahrzeit gemeinsam; bei einer fehlgeschlagenen Routenabfrage ohne verfügbaren Orts-Fallback steht dort „Nicht verfügbar“. Beim Start wird jede Person einmal geprüft. Danach wird nur eine Person aktualisiert, wenn sich ihre Koordinaten ändern. Nach einer erfolgreichen Anfrage wird die Route wiederverwendet, bis sich der Standort um mindestens 30 Meter vom letzten erfolgreichen Routenaufruf entfernt hat. Schlägt das Routing fehl und befindet sich die Person innerhalb eines konfigurierten Orts mit beiden eingetragenen Fallback-Werten, verwendet der Adapter Entfernung und Fahrzeit dieses Orts. Nach einem Fehler versucht HomeRadar es bei der nächsten Koordinatenänderung oder beim nächsten Adapterstart erneut.

Die Streckenlängen folgen der vom Routingdienst ausgewählten Route. Beim öffentlichen OSRM-Tabellendienst ist das die schnellste Route und nicht zwingend die kürzeste Straßenstrecke. Entfernung und Fahrzeit beziehen sich damit auf dieselbe schnellste Route.

Anwesenheit und Luftlinienentfernungen werden lokal berechnet. Für Heimrouten sendet der Adapter die aktuellen Koordinaten der Person und die Koordinaten des Zuhause-Orts an den Routingdienst. Wenn die Geoapify-Adressauflösung aktiviert ist, werden die aktuellen Koordinaten außerdem an Geoapify gesendet, sobald die personenspezifische Entfernungsschwelle erreicht ist.

Der OpenStreetMap-Link wird lokal erzeugt. Der Browser überträgt die Koordinaten erst beim Öffnen des Links an OpenStreetMap.

Schreibe `true` nach `persons.<personId>.refresh`, um für diese Person eine Adress- und Heimroutenabfrage zu erzwingen. Dabei werden die Bewegungsschwellen der Caches umgangen. Adressauflösung und Routenberechnung müssen dafür aktiviert sein. Der Auslöser wird automatisch auf `false` zurückgesetzt. Die `lastUpdate`-Datenpunkte für Adresse und Fahrzeit zeigen den Zeitpunkt des letzten erfolgreich aktualisierten Ergebnisses.

## Einrichtung

1. Füge in den Instanzeinstellungen jede Person hinzu, wähle ihre vorhandenen Breiten- und Längengrad-Datenpunkte aus und stelle die Entfernung für eine neue Adressabfrage ein (Standard: 100 Meter).
2. Füge die gewünschten Orte mit Koordinaten und Erkennungsradius hinzu. Optional kannst du beide Fallback-Werte für die Fahrt von einem Ort nach Hause eintragen. Markiere einen Ort als Zuhause. Wenn du einen anderen Ort auswählst, wird die vorherige Markierung automatisch entfernt.
3. Aktiviere die Fahrzeitberechnung und wähle einen OSRM-Server. Der öffentliche OSRM-Demodienst ist voreingestellt.
4. Entscheide unabhängig voneinander, ob Geoapify als Routing-Fallback und/oder zur Adressauflösung verwendet werden soll. Beide Optionen nutzen denselben Geoapify-API-Schlüssel.
Es sind keine Beispielpersonen, Orte, persönlichen Koordinaten oder Koordinaten-Datenpunkt-IDs vorbelegt. Lege die gewünschten Personen und Orte in den Instanzeinstellungen an.

## Geoapify-API-Schlüssel

Trage in den Instanzeinstellungen einen Geoapify-API-Schlüssel ein. Über zwei unabhängige Optionen legst du fest, ob HomeRadar Geoapify für die Adressauflösung, als Routing-Fallback für OSRM oder für beides verwendet.

1. [Erstelle kostenlos ein Geoapify-Konto und Projekt](https://myprojects.geoapify.com/).
2. Kopiere den API-Schlüssel des Projekts unter **API Keys**.
3. Trage ihn in den HomeRadar-Instanzeinstellungen unter **Reisezeiten** ein.

Der [kostenlose Geoapify-Tarif](https://www.geoapify.com/pricing-details/) umfasst derzeit 3.000 Credits pro Tag. Eine Adressabfrage kostet einen Credit. Die Heimroute verwendet eine 1×1-Matrix mit einem Credit Grundkosten zuzüglich eines möglichen, dokumentierten Entfernungsaufschlags. Der Adapter zählt die heutigen Credits erfolgreicher Geoapify-Antworten und erfasst fehlgeschlagene Aufrufe separat. Angezeigt wird der Verbrauch von HomeRadar, kein kontoweiter Gesamtverbrauch. Der Adressaufruf erfolgt erneut, wenn die pro Person eingestellte Bewegungsentfernung erreicht ist (Standard: 100 Meter). Kleinere Werte führen zu mehr Abfragen und verbrauchen mehr Credits. Straße und Hausnummer werden nur übernommen, wenn Geoapifys Adresstreffer höchstens 100 Meter von den Koordinaten entfernt liegt. Andere Ortsangaben bleiben verfügbar; die vollständige Rohantwort bleibt zur Prüfung gespeichert. Geoapify bietet beim Routing Free-Flow- oder angenäherten Verkehr, aber keine Live-Verkehrsdaten. Der API-Schlüssel wird geschützt und verschlüsselt in den Adaptereinstellungen gespeichert.

## Versionsverlauf

Die Änderungen pro Version stehen in der [CHANGELOG.md](CHANGELOG.md).

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```sh
npm install
npm test
```

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
