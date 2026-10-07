# Changelog

## 0.2.2 (2026-10-07)

- Set the combined home-route value to `Nicht verfügbar` when routing fails and no place fallback can be used.
- Rename the per-person `travelTimes` channel to `travelTime` and add a combined home-route value with rounded kilometers and minutes.
- Suppress street and house number when Geoapify's result is more than 100 meters from the person's coordinates; retain other address fields and the raw response.
- Limit daily API history to 30 days and remove the cumulative Geoapify credit counter.
- Calculate and store only each person's route home; keep configured places for local presence detection and home-route fallback.
- Move per-person coordinates and OpenStreetMap links into dedicated `location.coordinates` and `location.map` channels.
- Add an address refresh distance for each person, defaulting to 100 meters, with an explicit Geoapify credit-use hint in the settings.
- Track successful and failed OSRM and Geoapify requests by day and retain daily history for 30 days.
- Track Geoapify credits for successful responses using the published reverse-geocoding and single-destination route-matrix pricing rules.

## 0.2.1 (2026-10-06)

- Add a composed per-person address line using street, house number, city, and village while omitting missing components.
- Store travel-time datapoints directly under each person and place, without the intermediate `places` channel.
- Delete datapoints for people and places that are no longer configured when the adapter starts.

- Fill unavailable or empty address fields with `N/A` instead of leaving them blank.
- Keep people, places, travel times, and help in separate instance-setting tabs, with larger blue section headings inside each tab.

- Document optional Geoapify address resolution in the README introduction.

- Place the Geoapify address lookup and routing fallback options side by side, with address lookup first.
- Clarify that the Geoapify routing fallback applies to travel times.
- Set both Geoapify options to off by default at the root and in the routing settings.
- Add independent options to enable Geoapify routing fallback and address lookup separately.
- Remove the shared aggregate address JSON datapoint; keep address responses per person.
- Create individual datapoints for address components such as name, street, house number, district, and postal code; omit technical result metadata.
- Add one summary JSON datapoint containing the Geoapify responses for all people, keyed by person ID.
- Store the complete Geoapify response as JSON in an additional per-person datapoint.
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


