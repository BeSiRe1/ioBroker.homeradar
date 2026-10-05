# HomeRadar

## English

HomeRadar provides local presence detection for people and configured places, with optional route-based travel times.

### Features

- Configure any number of people by selecting existing latitude and longitude states.
- Configure any number of named places with individual detection radii.
- Determine whether a person is at home or at another configured place using local coordinate calculations.
- Optionally calculate driving times to configured places using an OSRM-compatible routing service.
- Set travel time to zero locally when the person is within the destination radius.
- Optionally mirror the travel time to home into an existing state.

### Initial configuration

Sample people and the home location are preconfigured. The home location uses the coordinates supplied during setup and a 100-meter radius. All entries can be changed in the instance settings, and additional people and places can be added there.

The default routing service is the public OSRM demo server. It does not provide live traffic information or an availability guarantee. You can disable routing or configure another OSRM-compatible server. When routing is enabled, the person's start coordinates and the destination coordinates are sent to that service. Presence and radius calculations stay local.

### Data points

The adapter creates states under `homeradar.0.persons.<personId>`:

- `presence.isHome`: whether the person is within the home radius.
- `presence.currentPlace`: configured place currently detected, or an empty string.
- `presence.lastUpdate`: time of the last coordinate evaluation.
- `places.<placeId>.inside`: whether the person is within that place's radius.
- `places.<placeId>.distance`: straight-line distance to the place in meters.
- `travelTimes.<placeId>.minutes`: estimated driving time in minutes.
- `travelTimes.<placeId>.distance`: route distance in kilometers.
- `travelTimes.<placeId>.status`: result or status of the last route calculation.

### Development status

This is an initial development version. Configuration, states, and behavior may change before a first release.

## Deutsch

HomeRadar erkennt lokal, ob Personen zu Hause oder an konfigurierten Orten sind. Optional kann der Adapter Fahrzeiten über einen Routingdienst berechnen.

### Funktionen

- Beliebig viele Personen über vorhandene Datenpunkte für Breitengrad und Längengrad einrichten.
- Beliebig viele Orte mit eigenem Namen und Erkennungsradius einrichten.
- Anwesenheit zu Hause oder an anderen Orten anhand der Koordinaten lokal erkennen.
- Optional Fahrzeiten zu konfigurierten Orten über einen OSRM-kompatiblen Routingdienst berechnen.
- Die Fahrzeit lokal auf null setzen, wenn sich eine Person innerhalb des Radius am Ziel befindet.
- Die Fahrzeit nach Hause optional zusätzlich in einen vorhandenen Datenpunkt schreiben.

### Grundeinrichtung

Beispielpersonen und der Ort „Zu Hause“ sind vorbelegt. Der Ort „Zu Hause“ verwendet die bei der Einrichtung angegebenen Koordinaten und einen Radius von 100 Metern. Alle Einträge lassen sich in den Instanzeinstellungen ändern; weitere Personen und Orte können dort hinzugefügt werden.

Als Routingdienst ist standardmäßig der öffentliche OSRM-Demodienst eingetragen. Er liefert keine Verkehrsinformationen in Echtzeit und bietet keine Verfügbarkeitsgarantie. Das Routing kann deaktiviert oder ein anderer OSRM-kompatibler Server eingetragen werden. Bei aktiviertem Routing werden die Startkoordinaten der Person und die Zielkoordinaten an diesen Dienst gesendet. Anwesenheits- und Radiusprüfungen erfolgen lokal.

### Datenpunkte

Der Adapter legt Datenpunkte unter `homeradar.0.persons.<personId>` an:

- `presence.isHome`: Gibt an, ob sich die Person innerhalb des Radius von „Zu Hause“ befindet.
- `presence.currentPlace`: Aktuell erkannter konfigurierter Ort; andernfalls ist der Wert leer.
- `presence.lastUpdate`: Zeitpunkt der letzten Koordinatenprüfung.
- `places.<placeId>.inside`: Gibt an, ob sich die Person innerhalb des Radius dieses Ortes befindet.
- `places.<placeId>.distance`: Luftlinienentfernung zum Ort in Metern.
- `travelTimes.<placeId>.minutes`: Geschätzte Fahrzeit in Minuten.
- `travelTimes.<placeId>.distance`: Streckenlänge in Kilometern.
- `travelTimes.<placeId>.status`: Ergebnis oder Status der letzten Routenberechnung.

### Entwicklungsstand

Dies ist eine erste Entwicklungsversion. Einstellungen, Datenpunkte und Verhalten können sich vor einer ersten Veröffentlichung noch ändern.

## Changelog / Änderungsverlauf

### 0.1.0 (2026-10-05)

- Initial development version with configurable people, places, presence detection, and optional OSRM travel times.
- Erste Entwicklungsversion mit konfigurierbaren Personen und Orten, Anwesenheitserkennung und optionalen OSRM-Fahrzeiten.
