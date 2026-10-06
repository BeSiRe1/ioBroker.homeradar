# HomeRadar for ioBroker

HomeRadar detects locally whether configured people are at home or at other frequently visited places. It can optionally calculate driving times from each person's current location to all configured places using public routing services. When enabled, Geoapify can also resolve each person's current coordinates into an address.

For routing and address details, see the [OSRM HTTP API documentation](https://project-osrm.org/docs/v26.4.0/http) and Geoapify documentation for [route matrices](https://apidocs.geoapify.com/docs/route-matrix/) and [reverse geocoding](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

## Features

- Configure any number of people using existing latitude and longitude states in ioBroker.
- Configure any number of named places with individual detection radii.
- Detect presence at home and at other configured places using local coordinate calculations.
- Show each person's current coordinates and a locally generated OpenStreetMap link.
- Calculate driving times from each person's current location to all configured places with one bundled matrix request; optionally use Geoapify as a fallback when OSRM fails.
- Resolve each person's current coordinates to a structured address with Geoapify when address lookup is enabled; reuse the result until the person moves at least 30 meters.
- Check all people once at startup, then update only a person whose coordinates change.
- Cache each person's matrix until their location changes by at least 30 meters.
- Optionally configure a distance and travel-time fallback from each place to home. These values are only used if online routing fails while a person is detected at that place.
- Set the travel time home to zero locally when a person is within the home radius; no routing request is needed at home.
- Show a central home-presence summary with a boolean, person count, and names.
- Show each person's presence, current place, distances, travel times, and route calculation status in the ioBroker object tree.

## Object structure

The adapter creates states at these paths:

```text
summary
├─ anyoneHome              whether at least one person is home
├─ homeCount               number of people currently home
└─ peopleAtHome            comma-separated names of people at home

persons.<personId>
├─ location
│  ├─ latitude              current latitude
│  ├─ longitude             current longitude
│  ├─ openStreetMapUrl      link to the person's current location
│  └─ address               address fields from Geoapify, when configured
│     ├─ formatted           full formatted address
│     ├─ street              street (plus available address components)
│     ├─ housenumber         house number
│     ├─ status              address lookup status
│     └─ response            complete Geoapify response as JSON
├─ presence
│  ├─ isHome                 whether the person is within the home radius
│  ├─ currentPlace           detected place, or not_home
│  └─ lastUpdate             time of the last coordinate evaluation
├─ places.<placeId>
│  ├─ inside                 whether the person is within the place radius
│  └─ distance               straight-line distance in meters
└─ travelTimes.places.<placeId>
   ├─ minutes                estimated driving time to the configured place
   ├─ distance               route length to the configured place in kilometers
   └─ status                 route calculation or cache status
```

The `travelTimes.places.<placeId>` states include every configured place, including home; there is no separate home travel-time branch. When a person is within the home radius, the home entry is set to zero locally. All people are checked once at startup. Afterwards, only a person whose coordinates change is updated. After a successful request, the matrix is reused until that person's location changes by at least 30 meters from the last successful matrix query. If a matrix request fails and the person is inside a configured place with both fallback values set, the adapter uses that place's fallback distance and travel time in the configured home-place entry. After an error, HomeRadar tries again on the next coordinate change or adapter restart.

The route distances follow the route selected by the routing service. With the public OSRM table service, this is the fastest route and not necessarily the shortest road route. The distance and travel time therefore describe the same fastest route.

Presence and straight-line distance calculations are local. Matrix requests send the person's current coordinates and the configured place coordinates to the routing service. When the Geoapify address-lookup option is enabled, the person's current coordinates are also sent to Geoapify; the address result is reused until the person moves at least 30 meters.

The OpenStreetMap link is generated locally; the browser sends the coordinates to OpenStreetMap only when the link is opened.

## Setup

1. In the adapter instance settings, add each person and select their existing latitude and longitude states.
2. Add the places you want to monitor, including their coordinates and detection radii. Optionally enter both fallback values for the journey from a place to home. Mark one place as home. Selecting a different home place clears the previous selection.
3. Enable travel time calculation and select an OSRM server. The public OSRM demo server is preconfigured.
4. Choose independently whether to use Geoapify as a routing fallback and whether to resolve addresses. Both options use the Geoapify API key.
No example people, places, personal coordinates, or coordinate datapoint IDs are preconfigured. Add the people and places you want to use in the instance settings.

## Geoapify API key

Enter a Geoapify API key in the instance settings. The separate options determine whether HomeRadar uses Geoapify for address lookup, as an OSRM routing fallback, or both. Both options are independently configurable.

1. [Create a free Geoapify account and project](https://myprojects.geoapify.com/).
2. Copy the project API key from **API Keys**.
3. Enter it in the HomeRadar instance settings under **Travel times**.

The [Geoapify free plan](https://www.geoapify.com/pricing-details/) currently includes 3,000 credits per day. A reverse-geocoding request costs one credit; a route matrix costs credits based on its number of source and target locations. The address lookup is cached until the person's location changes by at least 30 meters. Geoapify routing provides free-flow or approximated traffic, not live traffic. The API key is stored as a protected, encrypted adapter setting.

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

HomeRadar erkennt lokal, ob sich konfigurierte Personen zu Hause oder an anderen häufig besuchten Orten befinden. Über öffentliche Routingdienste berechnet der Adapter optional Fahrzeiten vom aktuellen Standort jeder Person zu allen konfigurierten Orten. Wenn aktiviert, kann Geoapify außerdem die aktuellen Koordinaten jeder Person in eine Adresse auflösen.

Weitere Informationen findest du in der [OSRM-HTTP-API-Dokumentation](https://project-osrm.org/docs/v26.4.0/http) sowie in der Geoapify-Dokumentation für [Routenmatrizen](https://apidocs.geoapify.com/docs/route-matrix/) und [Adressauflösung](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

## Funktionen

- Beliebig viele Personen über vorhandene ioBroker-Datenpunkte für Breiten- und Längengrad einrichten.
- Beliebig viele benannte Orte mit individuellem Erkennungsradius einrichten.
- Anwesenheit zu Hause und an anderen konfigurierten Orten anhand der Koordinaten lokal erkennen.
- Aktuelle Koordinaten jeder Person und einen lokal erzeugten OpenStreetMap-Link anzeigen.
- Fahrzeiten vom aktuellen Standort jeder Person zu allen konfigurierten Orten mit einer gebündelten Matrixabfrage berechnen; Geoapify optional als Fallback verwenden, wenn OSRM ausfällt.
- Die aktuellen Koordinaten jeder Person mit Geoapify in eine strukturierte Adresse auflösen, wenn die Adressauflösung aktiviert ist; das Ergebnis bis zu einer Standortänderung von 30 Metern wiederverwenden.
- Alle Personen beim Start einmal prüfen und danach nur die Person aktualisieren, deren Koordinaten sich ändern.
- Die Matrix jeder Person zwischenspeichern, bis sich ihr Standort mindestens 30 Meter verändert hat.
- Für jeden Ort optional Entfernung und Fahrzeit von dort nach Hause als Fallback hinterlegen. Diese Werte werden nur genutzt, wenn das Online-Routing fehlschlägt und die Person innerhalb des Erkennungsradius dieses Ortes erkannt wird.
- Die Fahrzeit nach Hause lokal auf null setzen, wenn sich eine Person innerhalb des Zuhause-Radius befindet; dafür wird keine Routenanfrage benötigt.
- Eine zentrale Anwesenheitsübersicht mit Boolean, Personenanzahl und Namen der anwesenden Personen anzeigen.
- Anwesenheit, aktuellen Ort, Entfernungen, Fahrzeiten und den Status der Routenberechnung im ioBroker-Datenpunktbaum anzeigen.

## Datenpunktstruktur

Der Adapter legt Datenpunkte unter folgenden Pfaden an:

```text
summary
├─ anyoneHome              mindestens eine Person ist zu Hause
├─ homeCount               Anzahl der Personen zu Hause
└─ peopleAtHome            durch Komma getrennte Namen der Personen zu Hause

persons.<personId>
├─ location
│  ├─ latitude              aktueller Breitengrad
│  ├─ longitude             aktueller Längengrad
│  ├─ openStreetMapUrl      Link zum aktuellen Standort der Person
│  └─ address               Geoapify-Adressdaten, falls konfiguriert
│     ├─ formatted           formatierte vollständige Adresse
│     ├─ street              Straße (sowie verfügbare Adressbestandteile)
│     ├─ housenumber         Hausnummer
│     ├─ status              Status der Adressauflösung
│     └─ response            vollständige Geoapify-Antwort als JSON
├─ presence
│  ├─ isHome                 Person befindet sich im Radius von Zuhause
│  ├─ currentPlace           erkannter Ort oder not_home
│  └─ lastUpdate             Zeitpunkt der letzten Koordinatenprüfung
├─ places.<placeId>
│  ├─ inside                 Person befindet sich innerhalb des Ortsradius
│  └─ distance               Luftlinienentfernung in Metern
└─ travelTimes.places.<placeId>
   ├─ minutes                geschätzte Fahrzeit zum konfigurierten Ort
   ├─ distance               Streckenlänge zum konfigurierten Ort in Kilometern
   └─ status                 Status der Routenberechnung oder des Caches
```

`travelTimes.places.<placeId>` enthält alle konfigurierten Orte einschließlich Zuhause; einen zusätzlichen Reisezeiten-Zweig für Zuhause gibt es nicht. Befindet sich eine Person innerhalb des Zuhause-Radius, werden die Werte für Zuhause lokal auf null gesetzt. Beim Start wird jede Person einmal geprüft. Danach wird nur eine Person aktualisiert, wenn sich ihre Koordinaten ändern. Nach einer erfolgreichen Anfrage wird die Matrix wiederverwendet, bis sich der Standort um mindestens 30 Meter vom letzten erfolgreichen Matrixaufruf entfernt hat. Schlägt eine Matrixanfrage fehl und befindet sich die Person innerhalb eines konfigurierten Orts mit beiden eingetragenen Fallback-Werten, verwendet der Adapter Entfernung und Fahrzeit dieses Orts im Eintrag des konfigurierten Zuhause-Orts. Nach einem Fehler versucht HomeRadar es bei der nächsten Koordinatenänderung oder beim nächsten Adapterstart erneut.

Die Streckenlängen folgen der vom Routingdienst ausgewählten Route. Beim öffentlichen OSRM-Tabellendienst ist das die schnellste Route und nicht zwingend die kürzeste Straßenstrecke. Entfernung und Fahrzeit beziehen sich damit auf dieselbe schnellste Route.

Anwesenheit und Luftlinienentfernungen werden lokal berechnet. Für Matrixanfragen sendet der Adapter die aktuellen Koordinaten der Person und die Koordinaten der konfigurierten Orte an den Routingdienst. Wenn die Geoapify-Adressauflösung aktiviert ist, werden die aktuellen Koordinaten außerdem an Geoapify gesendet. Das Ergebnis wird wiederverwendet, bis sich die Person mindestens 30 Meter bewegt.

Der OpenStreetMap-Link wird lokal erzeugt. Der Browser überträgt die Koordinaten erst beim Öffnen des Links an OpenStreetMap.

## Einrichtung

1. Füge in den Instanzeinstellungen jede Person hinzu und wähle ihre vorhandenen Breiten- und Längengrad-Datenpunkte aus.
2. Füge die gewünschten Orte mit Koordinaten und Erkennungsradius hinzu. Optional kannst du beide Fallback-Werte für die Fahrt von einem Ort nach Hause eintragen. Markiere einen Ort als Zuhause. Wenn du einen anderen Ort auswählst, wird die vorherige Markierung automatisch entfernt.
3. Aktiviere die Fahrzeitberechnung und wähle einen OSRM-Server. Der öffentliche OSRM-Demodienst ist voreingestellt.
4. Entscheide unabhängig voneinander, ob Geoapify als Routing-Fallback und/oder zur Adressauflösung verwendet werden soll. Beide Optionen nutzen denselben Geoapify-API-Schlüssel.
Es sind keine Beispielpersonen, Orte, persönlichen Koordinaten oder Koordinaten-Datenpunkt-IDs vorbelegt. Lege die gewünschten Personen und Orte in den Instanzeinstellungen an.

## Geoapify-API-Schlüssel

Trage in den Instanzeinstellungen einen Geoapify-API-Schlüssel ein. Über zwei unabhängige Optionen legst du fest, ob HomeRadar Geoapify für die Adressauflösung, als Routing-Fallback für OSRM oder für beides verwendet.

1. [Erstelle kostenlos ein Geoapify-Konto und Projekt](https://myprojects.geoapify.com/).
2. Kopiere den API-Schlüssel des Projekts unter **API Keys**.
3. Trage ihn in den HomeRadar-Instanzeinstellungen unter **Reisezeiten** ein.

Der [kostenlose Geoapify-Tarif](https://www.geoapify.com/pricing-details/) umfasst derzeit 3.000 Credits pro Tag. Eine Adressabfrage kostet einen Credit; die Kosten einer Routenmatrix hängen von der Anzahl ihrer Start- und Zielpunkte ab. Die Adresse wird bis zu einer Standortänderung von 30 Metern zwischengespeichert. Geoapify bietet beim Routing Free-Flow- oder angenäherten Verkehr, aber keine Live-Verkehrsdaten. Der API-Schlüssel wird geschützt und verschlüsselt in den Adaptereinstellungen gespeichert.

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
