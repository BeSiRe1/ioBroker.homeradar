# Changelog

## 0.1.0 (2026-10-05)

- Calculate and publish a travel time only for the route home; other configured places are used for presence detection and distances.
- Automatically clear the previous home selection when another place is marked as home.
- Remove the optional external home travel time output; travel times are available in HomeRadar's own datapoints.
- Add OpenRouteService as a fallback for route requests when OSRM fails; configure the API key in the instance settings.
- Initial development version with configurable people and places, presence detection, and optional OSRM travel time home.
