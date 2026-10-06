# Changelog

## 0.2.1 (2026-10-06)

- Read API keys from ioBroker's root configuration when the tab-specific setting is empty.
- Skip routing requests when a person is home and the only configured destination is home.
- Update all people at startup and thereafter only the person whose coordinates change; remove the periodic refresh interval.
- Add Geoapify reverse geocoding for current person locations and as the final optional routing fallback.
- Use the generic numeric role for travel-time values to prevent Admin from formatting minute counts as dates.

## 0.2.0 (2026-10-06)

- Remove the duplicate `travelTimes.home` branch; home travel metrics now use the configured home entry under `travelTimes.places.<placeId>`.

## 0.1.2 (2026-10-06)

- Display travel-time datapoints as numeric minute intervals and migrate existing datapoint roles at startup.

## 0.1.1 (2026-10-06)

- Clarify that OSRM route distances follow the fastest route and may not be the shortest road distance.
- Fix loading people and places when ioBroker stores populated lists in the root configuration alongside empty tab defaults.

## 0.1.0 (2026-10-05)

- Serialize home-summary writes so simultaneous person updates cannot leave the aggregate states out of sync.
- Cache each person's route matrix until their location has moved at least 30 meters from the last successful matrix request.
- Calculate travel times from each person's current location to all configured places with one OSRM matrix request and an OpenRouteService matrix fallback.
- Add optional per-place fallback distance and travel time home, used only when online matrix routing fails and the person is inside that place's radius.
- Add a central home-presence summary with anyone-home, home count, and people-at-home states.
- Add current latitude, longitude, and an OpenStreetMap link for each person.
- Read people, place, and routing settings from the adapter configuration so configured datapoints are created at startup.
- Keep a dedicated travel-time-home output alongside travel times to all configured places.
- Automatically clear the previous home selection when another place is marked as home.
- Remove the optional external home travel time output; travel times are available in HomeRadar's own datapoints.
- Add OpenRouteService as a fallback for route requests when OSRM fails; configure the API key in the instance settings.
- Initial development version with configurable people and places, presence detection, and optional OSRM travel time home.


