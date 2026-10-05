# HomeRadar for ioBroker

HomeRadar detects locally whether configured people are at home or at other frequently visited places. It can optionally calculate the driving time from each person's current location to home using public routing services.

For routing details, see the [OSRM documentation](https://project-osrm.org/docs/v5.24.0/api/) and the [OpenRouteService API documentation](https://openrouteservice.org/dev/).

## Features

- Configure any number of people using existing latitude and longitude states in ioBroker.
- Configure any number of named places with individual detection radii.
- Detect presence at home and at other configured places using local coordinate calculations.
- Optionally calculate driving times home with OSRM and use OpenRouteService as a fallback if OSRM fails.
- Set the travel time home to zero locally when a person is within the home radius; no routing request is needed at home.
- Show each person's presence, current place, distances, travel times, and route calculation status in the ioBroker object tree.

## Object structure

The adapter creates states under `homeradar.0.persons.<personId>`:

```text
<personId>
├─ presence
│  ├─ isHome                 whether the person is within the home radius
│  ├─ currentPlace           detected place, or not_home
│  └─ lastUpdate             time of the last coordinate evaluation
├─ places.<placeId>
│  ├─ inside                 whether the person is within the place radius
│  └─ distance               straight-line distance in meters
└─ travelTimes.home
   ├─ minutes                estimated driving time home
   ├─ distance               route length home in kilometers
   └─ status                 route calculation status
```

Presence and distance calculations are local. When a route home is requested, the person's current coordinates and the home coordinates are sent to the routing service.

## Setup

1. In the adapter instance settings, add each person and select their existing latitude and longitude states.
2. Add the places you want to monitor, including their coordinates and detection radii. Mark one place as home. Selecting a different home place clears the previous selection.
3. Enable travel time calculation and select an OSRM server. The public OSRM demo server is preconfigured.
4. OpenRouteService fallback is disabled by default. To use it, enable the fallback option and add an API key as described below.
5. Set the update interval. Coordinate changes trigger an update as well.

No example people, places, personal coordinates, or coordinate datapoint IDs are preconfigured. Add the people and places you want to use in the instance settings.

## OpenRouteService API key

OpenRouteService is only contacted when the configured OSRM service fails and the fallback option is enabled. It does not provide live traffic data. The public OSRM demo service does not provide live traffic data either, and neither public service guarantees availability. Travel times are estimates and may differ from actual journeys.

1. [Create a free OpenRouteService account](https://openrouteservice.org/sign-up/) and confirm your email address.
2. [Sign in](https://openrouteservice.org/log-in/) and open the **API Key** tab in the developer dashboard.
3. Copy the **Basic Key** and enter it in the HomeRadar instance settings under **Travel times**.

The [free Standard plan](https://openrouteservice.org/plans/) currently allows 2,000 Directions requests per day and 40 per minute. The API key is stored as a protected, encrypted adapter setting.

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

HomeRadar erkennt lokal, ob sich konfigurierte Personen zu Hause oder an anderen häufig besuchten Orten befinden. Optional berechnet der Adapter über öffentliche Routingdienste die Fahrzeit vom aktuellen Standort jeder Person nach Hause.

Weitere Informationen zum Routing findest du in der [OSRM-Dokumentation](https://project-osrm.org/docs/v5.24.0/api/) und in der [OpenRouteService-API-Dokumentation](https://openrouteservice.org/dev/).

## Funktionen

- Beliebig viele Personen über vorhandene ioBroker-Datenpunkte für Breiten- und Längengrad einrichten.
- Beliebig viele benannte Orte mit individuellem Erkennungsradius einrichten.
- Anwesenheit zu Hause und an anderen konfigurierten Orten anhand der Koordinaten lokal erkennen.
- Fahrzeiten nach Hause optional mit OSRM berechnen und bei einem Ausfall von OSRM OpenRouteService als Ausweichdienst verwenden.
- Die Fahrzeit nach Hause lokal auf null setzen, wenn sich eine Person innerhalb des Zuhause-Radius befindet; dafür wird keine Routenanfrage benötigt.
- Anwesenheit, aktuellen Ort, Entfernungen, Fahrzeiten und den Status der Routenberechnung im ioBroker-Datenpunktbaum anzeigen.

## Datenpunktstruktur

Der Adapter legt Datenpunkte unter `homeradar.0.persons.<personId>` an:

```text
<personId>
├─ presence
│  ├─ isHome                 Person befindet sich im Radius von Zuhause
│  ├─ currentPlace           erkannter Ort oder not_home
│  └─ lastUpdate             Zeitpunkt der letzten Koordinatenprüfung
├─ places.<placeId>
│  ├─ inside                 Person befindet sich innerhalb des Ortsradius
│  └─ distance               Luftlinienentfernung in Metern
└─ travelTimes.home
   ├─ minutes                geschätzte Fahrzeit nach Hause
   ├─ distance               Streckenlänge nach Hause in Kilometern
   └─ status                 Status der Routenberechnung
```

Anwesenheit und Entfernungen werden lokal berechnet. Für eine Routenanfrage nach Hause sendet der Adapter die aktuellen Koordinaten der Person und die Zuhause-Koordinaten an den Routingdienst.

## Einrichtung

1. Füge in den Instanzeinstellungen jede Person hinzu und wähle ihre vorhandenen Breiten- und Längengrad-Datenpunkte aus.
2. Füge die gewünschten Orte mit Koordinaten und Erkennungsradius hinzu. Markiere einen Ort als Zuhause. Wenn du einen anderen Ort auswählst, wird die vorherige Markierung automatisch entfernt.
3. Aktiviere die Fahrzeitberechnung und wähle einen OSRM-Server. Der öffentliche OSRM-Demodienst ist voreingestellt.
4. Der OpenRouteService-Ausweichdienst ist standardmäßig ausgeschaltet. Aktiviere die Fallback-Option und trage wie unten beschrieben einen API-Schlüssel ein, wenn du ihn verwenden möchtest.
5. Lege das Aktualisierungsintervall fest. Änderungen an den Koordinaten lösen ebenfalls eine Aktualisierung aus.

Es sind keine Beispielpersonen, Orte, persönlichen Koordinaten oder Koordinaten-Datenpunkt-IDs vorbelegt. Lege die gewünschten Personen und Orte in den Instanzeinstellungen an.

## OpenRouteService-API-Schlüssel

OpenRouteService wird nur angefragt, wenn der konfigurierte OSRM-Dienst fehlschlägt und der Ausweichdienst aktiviert ist. OpenRouteService liefert keine Live-Verkehrsdaten. Auch der öffentliche OSRM-Demodienst berücksichtigt keinen Live-Verkehr und keiner der öffentlichen Dienste garantiert eine Verfügbarkeit. Die Fahrzeiten sind Schätzungen und können von der tatsächlichen Fahrtdauer abweichen.

1. [Erstelle ein kostenloses OpenRouteService-Konto](https://openrouteservice.org/sign-up/) und bestätige deine E-Mail-Adresse.
2. [Melde dich an](https://openrouteservice.org/log-in/) und öffne im Entwickler-Dashboard den Reiter **API Key**.
3. Kopiere den **Basic Key** und trage ihn in den HomeRadar-Instanzeinstellungen unter **Reisezeiten** ein.

Der [kostenlose Standardtarif](https://openrouteservice.org/plans/) erlaubt derzeit 2.000 Routenanfragen pro Tag und 40 pro Minute. Der API-Schlüssel wird geschützt und verschlüsselt in den Adaptereinstellungen gespeichert.

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
