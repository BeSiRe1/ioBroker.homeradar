# HomeRadar for ioBroker

HomeRadar detects locally whether configured people are at home or at other frequently visited places. It can optionally calculate driving times to those places using public routing services.

For routing details, see the [OSRM documentation](https://project-osrm.org/docs/v5.24.0/api/) and the [OpenRouteService API documentation](https://openrouteservice.org/dev/).

## Features

- Configure any number of people using existing latitude and longitude states in ioBroker.
- Configure any number of named places with individual detection radii.
- Detect presence at home and at other configured places using local coordinate calculations.
- Optionally calculate driving times with OSRM and use OpenRouteService as a fallback if OSRM fails.
- Set the travel time to zero locally when a person is within the destination radius; no routing request is needed for that destination.
- Optionally mirror the travel time to home into an existing state.
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
└─ travelTimes.<placeId>
   ├─ minutes                estimated driving time
   ├─ distance               route length in kilometers
   └─ status                 route calculation status
```

Presence and distance calculations are local. When a route is requested, the person's current coordinates and the destination coordinates are sent to the routing service.

## Setup

1. In the adapter instance settings, add each person and select their existing latitude and longitude states.
2. Add the places you want to monitor, including their coordinates and detection radii. Mark one place as home.
3. Optionally select an existing state where HomeRadar should mirror that person's travel time to home.
4. Enable travel time calculation and select an OSRM server. The public OSRM demo server is preconfigured.
5. To allow OpenRouteService as a fallback, leave the fallback option enabled and add an API key as described below.
6. Set the update interval. Coordinate changes trigger an update as well.

A sample home location with a 100-meter radius is preconfigured and can be edited or removed. Sample people and places can also be changed in the instance settings.

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

HomeRadar erkennt lokal, ob sich konfigurierte Personen zu Hause oder an anderen häufig besuchten Orten befinden. Optional berechnet der Adapter Fahrzeiten zu diesen Orten über öffentliche Routingdienste.

Weitere Informationen zum Routing findest du in der [OSRM-Dokumentation](https://project-osrm.org/docs/v5.24.0/api/) und in der [OpenRouteService-API-Dokumentation](https://openrouteservice.org/dev/).

## Funktionen

- Beliebig viele Personen über vorhandene ioBroker-Datenpunkte für Breiten- und Längengrad einrichten.
- Beliebig viele benannte Orte mit individuellem Erkennungsradius einrichten.
- Anwesenheit zu Hause und an anderen konfigurierten Orten anhand der Koordinaten lokal erkennen.
- Fahrzeiten optional mit OSRM berechnen und bei einem Ausfall von OSRM OpenRouteService als Ausweichdienst verwenden.
- Die Fahrzeit lokal auf null setzen, wenn eine Person innerhalb des Zielradius ist; dafür wird keine Routenanfrage benötigt.
- Die Fahrzeit nach Hause optional zusätzlich in einen vorhandenen Datenpunkt schreiben.
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
└─ travelTimes.<placeId>
   ├─ minutes                geschätzte Fahrzeit
   ├─ distance               Streckenlänge in Kilometern
   └─ status                 Status der Routenberechnung
```

Anwesenheit und Entfernungen werden lokal berechnet. Für eine Routenanfrage sendet der Adapter die aktuellen Koordinaten der Person und die Zielkoordinaten an den Routingdienst.

## Einrichtung

1. Füge in den Instanzeinstellungen jede Person hinzu und wähle ihre vorhandenen Breiten- und Längengrad-Datenpunkte aus.
2. Füge die gewünschten Orte mit Koordinaten und Erkennungsradius hinzu. Markiere einen Ort als Zuhause.
3. Wähle optional einen vorhandenen Datenpunkt aus, in den HomeRadar zusätzlich die Fahrzeit nach Hause schreiben soll.
4. Aktiviere die Fahrzeitberechnung und wähle einen OSRM-Server. Der öffentliche OSRM-Demodienst ist voreingestellt.
5. Damit OpenRouteService als Ausweichdienst genutzt werden kann, lass die Fallback-Option aktiviert und trage wie unten beschrieben einen API-Schlüssel ein.
6. Lege das Aktualisierungsintervall fest. Änderungen an den Koordinaten lösen ebenfalls eine Aktualisierung aus.

Ein Beispielort „Zu Hause“ mit einem Radius von 100 Metern ist vorbelegt und kann geändert oder entfernt werden. Beispielpersonen und weitere Orte lassen sich ebenfalls in den Instanzeinstellungen anpassen.

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
