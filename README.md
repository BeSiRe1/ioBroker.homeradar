# HomeRadar for ioBroker

HomeRadar detects locally whether configured people are at home or at other frequently visited places. It can optionally calculate driving times from each person's current location to all configured places using public routing services.

For routing details, see the [OSRM HTTP API documentation](https://project-osrm.org/docs/v26.4.0/http) and the [OpenRouteService API documentation](https://openrouteservice.org/dev/).

## Features

- Configure any number of people using existing latitude and longitude states in ioBroker.
- Configure any number of named places with individual detection radii.
- Detect presence at home and at other configured places using local coordinate calculations.
- Show each person's current coordinates and a locally generated OpenStreetMap link.
- Calculate driving times from each person's current location to all configured places with one bundled matrix request; use OpenRouteService as a matrix fallback if OSRM fails.
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
│  └─ openStreetMapUrl      link to the person's current location
├─ presence
│  ├─ isHome                 whether the person is within the home radius
│  ├─ currentPlace           detected place, or not_home
│  └─ lastUpdate             time of the last coordinate evaluation
├─ places.<placeId>
│  ├─ inside                 whether the person is within the place radius
│  └─ distance               straight-line distance in meters
├─ travelTimes.places.<placeId>
│  ├─ minutes                estimated driving time to the configured place
│  ├─ distance               route length to the configured place in kilometers
│  └─ status                 route calculation or cache status
└─ travelTimes.home
   ├─ minutes                estimated driving time home
   ├─ distance               route length home in kilometers
   └─ status                 route calculation status
```

The `travelTimes.places.<placeId>` states include every configured place, including home. `travelTimes.home` remains the dedicated travel-time-to-home output. An initial matrix is queried per person at startup. After a successful request, the matrix is reused until that person's location changes by at least 30 meters from the last successful matrix query. If a matrix request fails and the person is inside a configured place with both fallback values set, the adapter uses that place's fallback distance and travel time in `travelTimes.home`. After a failed request, HomeRadar retries during the next configured update cycle.

Presence and straight-line distance calculations are local. Matrix requests send the person's current coordinates and the configured place coordinates to the routing service.

The OpenStreetMap link is generated locally; the browser sends the coordinates to OpenStreetMap only when the link is opened.

## Setup

1. In the adapter instance settings, add each person and select their existing latitude and longitude states.
2. Add the places you want to monitor, including their coordinates and detection radii. Optionally enter both fallback values for the journey from a place to home. Mark one place as home. Selecting a different home place clears the previous selection.
3. Enable travel time calculation and select an OSRM server. The public OSRM demo server is preconfigured.
4. OpenRouteService fallback is disabled by default. To use it, enable the fallback option and add an API key as described below.
5. Set the update interval. Coordinate changes trigger an update as well.

No example people, places, personal coordinates, or coordinate datapoint IDs are preconfigured. Add the people and places you want to use in the instance settings.

## OpenRouteService API key

OpenRouteService is only contacted when the configured OSRM matrix service fails and the fallback option is enabled. It does not provide live traffic data. The public OSRM demo service does not provide live traffic data either, and neither public service guarantees availability. Travel times are estimates and may differ from actual journeys.

1. [Create a free OpenRouteService account](https://openrouteservice.org/sign-up/) and confirm your email address.
2. [Sign in](https://openrouteservice.org/log-in/) and open the **API Key** tab in the developer dashboard.
3. Copy the **Basic Key** and enter it in the HomeRadar instance settings under **Travel times**.

The [free Standard plan](https://openrouteservice.org/plans/) currently allows 500 Matrix requests per day and 40 per minute. One request can calculate travel times from a person's current position to all configured destinations. The API key is stored as a protected, encrypted adapter setting.

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

HomeRadar erkennt lokal, ob sich konfigurierte Personen zu Hause oder an anderen häufig besuchten Orten befinden. Über öffentliche Routingdienste berechnet der Adapter optional Fahrzeiten vom aktuellen Standort jeder Person zu allen konfigurierten Orten.

Weitere Informationen findest du in der [OSRM-HTTP-API-Dokumentation](https://project-osrm.org/docs/v26.4.0/http) und in der [OpenRouteService-API-Dokumentation](https://openrouteservice.org/dev/).

## Funktionen

- Beliebig viele Personen über vorhandene ioBroker-Datenpunkte für Breiten- und Längengrad einrichten.
- Beliebig viele benannte Orte mit individuellem Erkennungsradius einrichten.
- Anwesenheit zu Hause und an anderen konfigurierten Orten anhand der Koordinaten lokal erkennen.
- Aktuelle Koordinaten jeder Person und einen lokal erzeugten OpenStreetMap-Link anzeigen.
- Fahrzeiten vom aktuellen Standort jeder Person zu allen konfigurierten Orten mit einer gebündelten Matrixabfrage berechnen; bei einem Ausfall von OSRM OpenRouteService als Ausweichdienst verwenden.
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
│  └─ openStreetMapUrl      Link zum aktuellen Standort der Person
├─ presence
│  ├─ isHome                 Person befindet sich im Radius von Zuhause
│  ├─ currentPlace           erkannter Ort oder not_home
│  └─ lastUpdate             Zeitpunkt der letzten Koordinatenprüfung
├─ places.<placeId>
│  ├─ inside                 Person befindet sich innerhalb des Ortsradius
│  └─ distance               Luftlinienentfernung in Metern
├─ travelTimes.places.<placeId>
│  ├─ minutes                geschätzte Fahrzeit zum konfigurierten Ort
│  ├─ distance               Streckenlänge zum konfigurierten Ort in Kilometern
│  └─ status                 Status der Routenberechnung oder des Caches
└─ travelTimes.home
   ├─ minutes                geschätzte Fahrzeit nach Hause
   ├─ distance               Streckenlänge nach Hause in Kilometern
   └─ status                 Status der Routenberechnung
```

`travelTimes.places.<placeId>` enthält alle konfigurierten Orte einschließlich Zuhause. `travelTimes.home` bleibt der eigene Datenpunkt für die Fahrzeit nach Hause. Beim Start wird pro Person eine Matrix für alle Ziele angefragt. Nach einer erfolgreichen Anfrage wird sie wiederverwendet, bis sich der Standort um mindestens 30 Meter vom letzten erfolgreichen Matrixaufruf entfernt hat. Schlägt eine Matrixanfrage fehl und befindet sich die Person innerhalb eines konfigurierten Orts mit beiden eingetragenen Fallback-Werten, verwendet der Adapter Entfernung und Fahrzeit dieses Orts in `travelTimes.home`. Nach einem Fehler versucht HomeRadar es im nächsten Aktualisierungszyklus erneut.

Anwesenheit und Luftlinienentfernungen werden lokal berechnet. Für Matrixanfragen sendet der Adapter die aktuellen Koordinaten der Person und die Koordinaten der konfigurierten Orte an den Routingdienst.

Der OpenStreetMap-Link wird lokal erzeugt. Der Browser überträgt die Koordinaten erst beim Öffnen des Links an OpenStreetMap.

## Einrichtung

1. Füge in den Instanzeinstellungen jede Person hinzu und wähle ihre vorhandenen Breiten- und Längengrad-Datenpunkte aus.
2. Füge die gewünschten Orte mit Koordinaten und Erkennungsradius hinzu. Optional kannst du beide Fallback-Werte für die Fahrt von einem Ort nach Hause eintragen. Markiere einen Ort als Zuhause. Wenn du einen anderen Ort auswählst, wird die vorherige Markierung automatisch entfernt.
3. Aktiviere die Fahrzeitberechnung und wähle einen OSRM-Server. Der öffentliche OSRM-Demodienst ist voreingestellt.
4. Der OpenRouteService-Ausweichdienst ist standardmäßig ausgeschaltet. Aktiviere die Fallback-Option und trage wie unten beschrieben einen API-Schlüssel ein, wenn du ihn verwenden möchtest.
5. Lege das Aktualisierungsintervall fest. Änderungen an den Koordinaten lösen ebenfalls eine Aktualisierung aus.

Es sind keine Beispielpersonen, Orte, persönlichen Koordinaten oder Koordinaten-Datenpunkt-IDs vorbelegt. Lege die gewünschten Personen und Orte in den Instanzeinstellungen an.

## OpenRouteService-API-Schlüssel

OpenRouteService wird nur angefragt, wenn die konfigurierte OSRM-Matrixabfrage fehlschlägt und der Ausweichdienst aktiviert ist. OpenRouteService liefert keine Live-Verkehrsdaten. Auch der öffentliche OSRM-Demodienst berücksichtigt keinen Live-Verkehr und keiner der öffentlichen Dienste garantiert eine Verfügbarkeit. Die Fahrzeiten sind Schätzungen und können von der tatsächlichen Fahrtdauer abweichen.

1. [Erstelle ein kostenloses OpenRouteService-Konto](https://openrouteservice.org/sign-up/) und bestätige deine E-Mail-Adresse.
2. [Melde dich an](https://openrouteservice.org/log-in/) und öffne im Entwickler-Dashboard den Reiter **API Key**.
3. Kopiere den **Basic Key** und trage ihn in den HomeRadar-Instanzeinstellungen unter **Reisezeiten** ein.

Der [kostenlose Standardtarif](https://openrouteservice.org/plans/) erlaubt derzeit 500 Matrixanfragen pro Tag und 40 pro Minute. Mit einer Anfrage können die Fahrzeiten von einem aktuellen Standort zu allen konfigurierten Zielen berechnet werden. Der API-Schlüssel wird geschützt und verschlüsselt in den Adaptereinstellungen gespeichert.

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
