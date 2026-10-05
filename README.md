# HomeRadar

HomeRadar provides local presence detection for people and configured places, with optional route-based travel times.

## Features

- Configure any number of people by selecting existing latitude and longitude states.
- Configure any number of named places with individual detection radii.
- Determine whether a person is at home or at another configured place using local coordinate calculations.
- Optionally calculate driving times to configured places using an OSRM-compatible routing service.
- Set travel time to zero locally when the person is within the destination radius.
- Optionally mirror the travel time to home into an existing state.

## Initial configuration

Rene and Silke are preconfigured with the coordinate state IDs supplied during setup. The home location is initialized with the supplied coordinates and a 100-meter radius. All entries can be changed in the instance settings, and additional people and places can be added there.

The default routing service is the public OSRM demo server. It does not provide live traffic information. You can disable routing or configure another OSRM-compatible server. When routing is enabled, the person's start coordinates and the destination coordinates are sent to that service. Presence and geofence calculations stay local.

## Data points

The adapter creates states under `homeradar.0.persons.<personId>`:

- `presence.isHome`: whether the person is within the home radius.
- `presence.currentPlace`: configured place currently detected, or an empty string.
- `presence.lastUpdate`: time of the last coordinate evaluation.
- `places.<placeId>.inside`: whether the person is within that place's radius.
- `places.<placeId>.distance`: straight-line distance to the place in meters.
- `travelTimes.<placeId>.minutes`: estimated driving time in minutes.
- `travelTimes.<placeId>.distance`: route distance in kilometers.
- `travelTimes.<placeId>.status`: result or status of the last route calculation.

## Development status

This is an initial development version. Configuration, states, and behavior may change before a first release.

## Changelog

### 0.1.0 (2026-10-05)

- Initial development version with configurable people, places, presence detection, and optional OSRM travel times.
