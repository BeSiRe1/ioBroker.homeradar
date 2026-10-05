'use strict';

const utils = require('@iobroker/adapter-core');

const ROUTE_REQUEST_GAP_MS = 1200;

class HomeRadarAdapter extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'homeradar' });

        this.people = [];
        this.places = [];
        this.inputToPerson = new Map();
        this.personGeneration = new Map();
        this.pendingPeople = new Set();
        this.activePeople = new Set();
        this.routeCache = new Map();
        this.presenceByPerson = new Map();
        this.routeQueue = [];
        this.routeQueueRunning = false;
        this.lastRouteRequestAt = 0;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setState('info.connection', false, true);
        this.people = this.loadPeople();
        this.places = this.loadPlaces();
        await this.createOutputTree();

        for (const person of this.people) {
            this.inputToPerson.set(person.latitudeId, person);
            this.inputToPerson.set(person.longitudeId, person);
            this.subscribeForeignStates(person.latitudeId);
            this.subscribeForeignStates(person.longitudeId);
        }

        await this.setState('info.connection', true, true);
        for (const person of this.people) this.schedulePersonUpdate(person);

        const intervalMinutes = Math.max(1, Number(this.getConfigValue('routingTab', 'updateIntervalMinutes', 5)) || 5);
        this.refreshTimer = this.setInterval(() => {
            for (const person of this.people) this.schedulePersonUpdate(person);
        }, intervalMinutes * 60 * 1000);
    }

    onStateChange(id, state) {
        if (!state) return;
        const person = this.inputToPerson.get(id);
        if (person) this.schedulePersonUpdate(person);
    }

    getConfigValue(section, key, fallback) {
        const nested = this.config[section];
        if (nested && Object.prototype.hasOwnProperty.call(nested, key)) return nested[key];
        if (Object.prototype.hasOwnProperty.call(this.config, key)) return this.config[key];
        return fallback;
    }

    onUnload(callback) {
        if (this.refreshTimer) this.clearInterval(this.refreshTimer);
        callback();
    }

    loadPeople() {
        const people = this.getConfigValue('peopleTab', 'people', []);
        const configured = Array.isArray(people) ? people : [];
        const result = [];
        const usedIds = new Set();

        for (const entry of configured) {
            const id = this.safeId(entry.id || entry.name);
            if (!id || !entry.latitudeId || !entry.longitudeId) {
                this.log.warn(`Person „${entry.name || entry.id || 'ohne Namen'}“ übersprungen: ID und Koordinaten-Datenpunkte sind erforderlich.`);
                continue;
            }
            if (usedIds.has(id)) {
                this.log.warn(`Person mit doppelter ID „${id}“ übersprungen.`);
                continue;
            }

            usedIds.add(id);
            result.push({
                id,
                name: String(entry.name || id),
                latitudeId: String(entry.latitudeId).trim(),
                longitudeId: String(entry.longitudeId).trim()
            });
        }
        return result;
    }

    loadPlaces() {
        const places = this.getConfigValue('placesTab', 'places', []);
        const configured = Array.isArray(places) ? places : [];
        const result = [];
        const usedIds = new Set();
        let homeAlreadySelected = false;

        for (const entry of configured) {
            const id = this.safeId(entry.id || entry.name);
            const latitude = Number(entry.latitude);
            const longitude = Number(entry.longitude);
            let fallbackHomeDistanceKm = this.parseOptionalNonNegativeNumber(entry.fallbackHomeDistanceKm);
            let fallbackHomeMinutes = this.parseOptionalNonNegativeNumber(entry.fallbackHomeMinutes);
            if (!id || !this.validCoordinates(latitude, longitude)) {
                this.log.warn(`Ort „${entry.name || entry.id || 'ohne Namen'}“ übersprungen: ID oder Koordinaten sind ungültig.`);
                continue;
            }
            if (usedIds.has(id)) {
                this.log.warn(`Ort mit doppelter ID „${id}“ übersprungen.`);
                continue;
            }

            if ((fallbackHomeDistanceKm === null) !== (fallbackHomeMinutes === null)) {
                this.log.warn(`Fallback für „${entry.name || id}“ wird ignoriert: Entfernung und Fahrzeit nach Hause müssen gemeinsam eingetragen werden.`);
                fallbackHomeDistanceKm = null;
                fallbackHomeMinutes = null;
            }

            const isHome = entry.isHome === true && !homeAlreadySelected;
            if (entry.isHome === true && homeAlreadySelected) {
                this.log.warn(`Nur ein Ort kann als Zuhause markiert sein. „${entry.name || id}“ wird als normaler Ort behandelt.`);
            }
            homeAlreadySelected ||= isHome;
            usedIds.add(id);
            result.push({
                id,
                name: String(entry.name || id),
                latitude,
                longitude,
                radius: Math.max(1, Number(entry.radius) || 100),
                isHome,
                fallbackHomeDistanceKm,
                fallbackHomeMinutes
            });
        }
        return result;
    }

    safeId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    validCoordinates(latitude, longitude) {
        return Number.isFinite(latitude) && Number.isFinite(longitude) &&
            latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }

    parseCoordinate(value) {
        if (typeof value === 'string' && value.trim() === '') return NaN;
        const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    parseOptionalNonNegativeNumber(value) {
        if (value === undefined || value === null || String(value).trim() === '') return null;
        const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }

    async ensureChannel(id, name) {
        await this.setObjectNotExists(id, {
            type: 'channel',
            common: { name },
            native: {}
        });
    }

    async ensureState(id, name, type, role, unit) {
        await this.setObjectNotExists(id, {
            type: 'state',
            common: {
                name,
                type,
                role,
                read: true,
                write: false,
                ...(unit ? { unit } : {})
            },
            native: {}
        });
    }

    async createOutputTree() {
        await this.ensureChannel('summary', 'Anwesenheitsübersicht');
        await this.ensureState('summary.anyoneHome', 'Mindestens eine Person zu Hause', 'boolean', 'indicator');
        await this.ensureState('summary.homeCount', 'Anzahl der Personen zu Hause', 'number', 'value');
        await this.ensureState('summary.peopleAtHome', 'Personen zu Hause', 'string', 'text');
        await this.setValue('summary.anyoneHome', false);
        await this.setValue('summary.homeCount', 0);
        await this.setValue('summary.peopleAtHome', '');

        await this.ensureChannel('persons', 'Personen');

        for (const person of this.people) {
            await this.ensureChannel(`persons.${person.id}`, person.name);
            await this.ensureChannel(`persons.${person.id}.location`, 'Aktueller Standort');
            await this.ensureState(`persons.${person.id}.location.latitude`, 'Aktueller Breitengrad', 'number', 'value.gps.latitude', '°');
            await this.ensureState(`persons.${person.id}.location.longitude`, 'Aktueller Längengrad', 'number', 'value.gps.longitude', '°');
            await this.ensureState(`persons.${person.id}.location.openStreetMapUrl`, 'Standort auf OpenStreetMap', 'string', 'text.url');
            await this.ensureChannel(`persons.${person.id}.presence`, 'Anwesenheit');
            await this.ensureState(`persons.${person.id}.presence.isHome`, 'Ist zu Hause', 'boolean', 'indicator');
            await this.ensureState(`persons.${person.id}.presence.currentPlace`, 'Aktueller Aufenthaltsort', 'string', 'text');
            await this.ensureState(`persons.${person.id}.presence.lastUpdate`, 'Letzte Koordinatenprüfung', 'number', 'date', 'ms');
            await this.ensureChannel(`persons.${person.id}.places`, 'Orte');
            await this.ensureChannel(`persons.${person.id}.travelTimes`, 'Reisezeiten');
            await this.ensureChannel(`persons.${person.id}.travelTimes.home`, 'Fahrzeit nach Hause');
            await this.ensureState(`persons.${person.id}.travelTimes.home.minutes`, 'Fahrzeit nach Hause', 'number', 'value.timer', 'min');
            await this.ensureState(`persons.${person.id}.travelTimes.home.distance`, 'Streckenlänge nach Hause', 'number', 'value.distance', 'km');
            await this.ensureState(`persons.${person.id}.travelTimes.home.status`, 'Status der Routenberechnung nach Hause', 'string', 'text');
            await this.ensureChannel(`persons.${person.id}.travelTimes.places`, 'Fahrzeiten zu Orten');

            for (const place of this.places) {
                await this.ensureChannel(`persons.${person.id}.places.${place.id}`, place.name);
                await this.ensureState(`persons.${person.id}.places.${place.id}.inside`, 'Innerhalb des Erkennungsradius', 'boolean', 'indicator');
                await this.ensureState(`persons.${person.id}.places.${place.id}.distance`, 'Luftlinienentfernung', 'number', 'value.distance', 'm');
                await this.ensureChannel(`persons.${person.id}.travelTimes.places.${place.id}`, place.name);
                await this.ensureState(`persons.${person.id}.travelTimes.places.${place.id}.minutes`, `Fahrzeit zum Ort ${place.name}`, 'number', 'value.timer', 'min');
                await this.ensureState(`persons.${person.id}.travelTimes.places.${place.id}.distance`, `Streckenlänge zum Ort ${place.name}`, 'number', 'value.distance', 'km');
                await this.ensureState(`persons.${person.id}.travelTimes.places.${place.id}.status`, `Status der Routenberechnung zum Ort ${place.name}`, 'string', 'text');
            }
        }
    }

    async updateHomeSummary() {
        const peopleAtHome = this.people
            .filter(person => this.presenceByPerson.get(person.id) === true)
            .map(person => person.name);
        await this.setValue('summary.anyoneHome', peopleAtHome.length > 0);
        await this.setValue('summary.homeCount', peopleAtHome.length);
        await this.setValue('summary.peopleAtHome', peopleAtHome.join(', '));
    }

    schedulePersonUpdate(person) {
        this.personGeneration.set(person.id, (this.personGeneration.get(person.id) || 0) + 1);
        this.pendingPeople.add(person.id);
        if (this.activePeople.has(person.id)) return;

        this.activePeople.add(person.id);
        void (async () => {
            while (this.pendingPeople.has(person.id)) {
                this.pendingPeople.delete(person.id);
                const generation = this.personGeneration.get(person.id);
                try {
                    await this.updatePerson(person, generation);
                } catch (error) {
                    this.log.warn(`Aktualisierung für ${person.name} fehlgeschlagen: ${error.message || error}`);
                }
            }
            this.activePeople.delete(person.id);
        })();
    }

    async readPersonCoordinates(person) {
        const [latitudeState, longitudeState] = await Promise.all([
            this.getForeignStateAsync(person.latitudeId),
            this.getForeignStateAsync(person.longitudeId)
        ]);

        const latitude = latitudeState ? this.parseCoordinate(latitudeState.val) : NaN;
        const longitude = longitudeState ? this.parseCoordinate(longitudeState.val) : NaN;
        return this.validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
    }

    distanceMeters(lat1, lon1, lat2, lon2) {
        const toRadians = degrees => degrees * Math.PI / 180;
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    async setValue(id, value) {
        await this.setState(id, value, true);
    }

    async updatePerson(person, generation) {
        const coordinates = await this.readPersonCoordinates(person);
        if (!coordinates) {
            await this.setValue(`persons.${person.id}.presence.currentPlace`, 'Koordinaten nicht verfügbar');
            await this.setValue(`persons.${person.id}.presence.isHome`, false);
            this.presenceByPerson.delete(person.id);
            await this.updateHomeSummary();
            return;
        }
        if (this.personGeneration.get(person.id) !== generation) return;

        const placeDistances = this.places.map(place => ({
            place,
            distance: this.distanceMeters(coordinates.latitude, coordinates.longitude, place.latitude, place.longitude)
        }));
        const insidePlaces = placeDistances
            .filter(item => item.distance <= item.place.radius)
            .sort((a, b) => a.distance - b.distance);
        const currentPlace = insidePlaces[0];
        const homePlace = placeDistances.find(item => item.place.isHome);
        const isHome = !!homePlace && homePlace.distance <= homePlace.place.radius;

        await this.setValue(`persons.${person.id}.location.latitude`, coordinates.latitude);
        await this.setValue(`persons.${person.id}.location.longitude`, coordinates.longitude);
        await this.setValue(`persons.${person.id}.location.openStreetMapUrl`, this.openStreetMapUrl(coordinates));
        this.presenceByPerson.set(person.id, isHome);
        await this.setValue(`persons.${person.id}.presence.isHome`, isHome);
        await this.setValue(`persons.${person.id}.presence.currentPlace`, currentPlace ? currentPlace.place.name : 'not_home');
        await this.setValue(`persons.${person.id}.presence.lastUpdate`, Date.now());
        await this.updateHomeSummary();

        for (const item of placeDistances) {
            if (this.personGeneration.get(person.id) !== generation) return;

            const place = item.place;
            const inside = item.distance <= place.radius;
            const placeBase = `persons.${person.id}.places.${place.id}`;

            await this.setValue(`${placeBase}.inside`, inside);
            await this.setValue(`${placeBase}.distance`, Math.round(item.distance));
        }

        const travelBase = `persons.${person.id}.travelTimes.home`;
        if (!homePlace) {
            await this.setValue(`${travelBase}.status`, 'Kein Zuhause-Ort konfiguriert');
        } else if (isHome) {
            await this.setValue(`${travelBase}.minutes`, 0);
            await this.setValue(`${travelBase}.distance`, 0);
            await this.setValue(`${travelBase}.status`, 'Am Ziel');
        } else if (!this.getConfigValue('routingTab', 'routingEnabled', true)) {
            await this.setValue(`${travelBase}.status`, 'Routenberechnung deaktiviert');
        }

        if (!this.getConfigValue('routingTab', 'routingEnabled', true)) {
            for (const place of this.places) {
                await this.setValue(`persons.${person.id}.travelTimes.places.${place.id}.status`, 'Routenberechnung deaktiviert');
            }
            return;
        }
        if (!this.places.length) return;

        if (homePlace && !isHome) await this.setValue(`${travelBase}.status`, 'Wird berechnet');
        for (const place of this.places) {
            await this.setValue(`persons.${person.id}.travelTimes.places.${place.id}.status`, 'Wird berechnet');
        }

        let matrix;
        let matrixError;
        try {
            matrix = await this.getPersonRouteMatrix(person, coordinates);
        } catch (error) {
            matrixError = error;
        }
        if (this.personGeneration.get(person.id) !== generation) return;

        for (let index = 0; index < this.places.length; index++) {
            const place = this.places[index];
            const route = matrix?.routes[index];
            const placeTravelBase = `persons.${person.id}.travelTimes.places.${place.id}`;
            if (!route || !Number.isFinite(route.duration) || !Number.isFinite(route.distance)) {
                await this.setValue(`${placeTravelBase}.status`, matrixError ? `Fehler: ${matrixError.message || matrixError}` : 'Keine Route gefunden');
                continue;
            }
            await this.setValue(`${placeTravelBase}.minutes`, Math.round(route.duration / 60));
            await this.setValue(`${placeTravelBase}.distance`, Math.round(route.distance / 100) / 10);
            const cacheLabel = matrix.cached ? 'Zwischengespeichert' : 'OK';
            const providerLabel = matrix.provider === 'openrouteservice' ? 'OpenRouteService' : 'OSRM';
            await this.setValue(`${placeTravelBase}.status`, `${cacheLabel} (${providerLabel})`);
        }

        if (!homePlace || isHome) return;
        const homeIndex = this.places.findIndex(place => place.id === homePlace.place.id);
        const homeRoute = matrix?.routes[homeIndex];
        if (homeRoute && Number.isFinite(homeRoute.duration) && Number.isFinite(homeRoute.distance)) {
            await this.setValue(`${travelBase}.minutes`, Math.round(homeRoute.duration / 60));
            await this.setValue(`${travelBase}.distance`, Math.round(homeRoute.distance / 100) / 10);
            const cacheLabel = matrix.cached ? 'Zwischengespeichert' : 'OK';
            const providerLabel = matrix.provider === 'openrouteservice' ? 'OpenRouteService' : 'OSRM';
            await this.setValue(`${travelBase}.status`, `${cacheLabel} (${providerLabel})`);
        } else {
            const fallbackPlace = currentPlace?.place;
            const hasFallback = fallbackPlace &&
                Number.isFinite(fallbackPlace.fallbackHomeDistanceKm) &&
                Number.isFinite(fallbackPlace.fallbackHomeMinutes);
            if (hasFallback) {
                await this.setValue(`${travelBase}.minutes`, fallbackPlace.fallbackHomeMinutes);
                await this.setValue(`${travelBase}.distance`, fallbackPlace.fallbackHomeDistanceKm);
                await this.setValue(`${travelBase}.status`, `Fallback: ${fallbackPlace.name}`);
            } else {
                const errorMessage = matrixError?.message || 'Keine Route nach Hause gefunden';
                await this.setValue(`${travelBase}.status`, `Fehler: ${errorMessage}`);
            }
        }
        if (matrixError) this.log.warn(`Routenmatrix für ${person.name} fehlgeschlagen: ${matrixError.message || matrixError}`);
    }

    openStreetMapUrl(coordinates) {
        const { latitude, longitude } = coordinates;
        return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
    }

    async getPersonRouteMatrix(person, origin) {
        const cached = this.routeCache.get(person.id);
        if (cached && this.distanceMeters(cached.origin.latitude, cached.origin.longitude, origin.latitude, origin.longitude) < 30) {
            return { ...cached, cached: true };
        }

        const matrix = await this.enqueueRouteMatrix(origin, this.places);
        this.routeCache.set(person.id, {
            origin: { ...origin },
            provider: matrix.provider,
            routes: matrix.routes
        });
        return { ...matrix, cached: false };
    }

    enqueueRouteMatrix(origin, destinations) {
        return new Promise((resolve, reject) => {
            this.routeQueue.push({ origin, destinations, resolve, reject });
            void this.processRouteQueue();
        });
    }

    async processRouteQueue() {
        if (this.routeQueueRunning) return;
        this.routeQueueRunning = true;

        try {
            while (this.routeQueue.length) {
                const waitMs = Math.max(0, ROUTE_REQUEST_GAP_MS - (Date.now() - this.lastRouteRequestAt));
                if (waitMs) await this.delay(waitMs);
                const job = this.routeQueue.shift();
                this.lastRouteRequestAt = Date.now();

                try {
                    job.resolve(await this.requestRouteMatrix(job.origin, job.destinations));
                } catch (error) {
                    job.reject(error);
                }
            }
        } finally {
            this.routeQueueRunning = false;
            if (this.routeQueue.length) void this.processRouteQueue();
        }
    }

    async requestRouteMatrix(origin, destinations) {
        let osrmError;
        try {
            return await this.requestOsrmMatrix(origin, destinations);
        } catch (error) {
            osrmError = error;
        }

        if (!this.getConfigValue('routingTab', 'useOpenRouteServiceFallback', false)) throw osrmError;
        const apiKey = String(this.getConfigValue('routingTab', 'openRouteServiceApiKey', '') || '').trim();
        if (!apiKey) {
            throw new Error(`OSRM: ${osrmError.message || osrmError}; OpenRouteService-Fallback ist aktiviert, aber es ist kein API-Schlüssel eingetragen`);
        }

        try {
            return await this.requestOpenRouteServiceMatrix(origin, destinations, apiKey);
        } catch (error) {
            throw new Error(`OSRM: ${osrmError.message || osrmError}; OpenRouteService: ${error.message || error}`);
        }
    }

    async requestOsrmMatrix(origin, destinations) {
        const baseUrl = String(this.getConfigValue('routingTab', 'routingUrl', 'https://router.project-osrm.org') || 'https://router.project-osrm.org').replace(/\/+$/, '');
        const locations = [origin, ...destinations].map(point => `${point.longitude},${point.latitude}`).join(';');
        const destinationIndexes = destinations.map((_, index) => index + 1).join(';');
        const url = `${baseUrl}/table/v1/driving/${locations}?sources=0&destinations=${destinationIndexes}&annotations=duration,distance`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'ioBroker.homeradar' },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Routingdienst antwortet mit HTTP ${response.status}`);

        const result = await response.json();
        if (result.code !== 'Ok' || !Array.isArray(result.durations?.[0]) || !Array.isArray(result.distances?.[0])) {
            throw new Error('Keine gültige Routenmatrix erhalten');
        }
        return {
            provider: 'osrm',
            routes: destinations.map((_, index) => ({
                duration: result.durations[0][index],
                distance: result.distances[0][index]
            }))
        };
    }

    async requestOpenRouteServiceMatrix(origin, destinations, apiKey) {
        const locations = [origin, ...destinations].map(point => [point.longitude, point.latitude]);
        const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
            method: 'POST',
            headers: {
                Authorization: apiKey,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                locations,
                sources: ['0'],
                destinations: destinations.map((_, index) => String(index + 1)),
                metrics: ['duration', 'distance'],
                units: 'm'
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Routingdienst antwortet mit HTTP ${response.status}`);

        const result = await response.json();
        if (!Array.isArray(result.durations?.[0]) || !Array.isArray(result.distances?.[0])) {
            throw new Error('Keine gültige Routenmatrix erhalten');
        }
        return {
            provider: 'openrouteservice',
            routes: destinations.map((_, index) => ({
                duration: result.durations[0][index],
                distance: result.distances[0][index]
            }))
        };
    }
}

if (require.main !== module) {
    module.exports = options => new HomeRadarAdapter(options);
} else {
    new HomeRadarAdapter();
}
