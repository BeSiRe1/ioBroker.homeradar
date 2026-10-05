# Changelog

## 0.1.0 (2026-10-05)

- Cache each person's route matrix until their location has moved at least 30 meters from the last successful matrix request.
- Calculate travel times from each person's current location to all configured places with one OSRM matrix request and an OpenRouteService matrix fallback.
- Add optional per-place fallback distance and travel time home, used only when online matrix routing fails and the person is inside that place's radius.
- Add a central home-presence summary with anyone-home, home count, and people-at-home states.
- Add current latitude, longitude, and an OpenStreetMap link for each person.
- Read people, place, and routing settings from the nested configuration panels so configured datapoints are created at startup.
- Keep a dedicated travel-time-home output alongside travel times to all configured places.
- Automatically clear the previous home selection when another place is marked as home.
- Remove the optional external home travel time output; travel times are available in HomeRadar's own datapoints.
- Add OpenRouteService as a fallback for route requests when OSRM fails; configure the API key in the instance settings.
- Initial development version with configurable people and places, presence detection, and optional OSRM travel time home.
