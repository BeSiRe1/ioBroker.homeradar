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

        const intervalMinutes = Math.max(1, Number(this.config.updateIntervalMinutes) || 5);
        this.refreshTimer = this.setInterval(() => {
            for (const person of this.people) this.schedulePersonUpdate(person);
        }, intervalMinutes * 60 * 1000);
    }

    onStateChange(id, state) {
        if (!state) return;
        const person = this.inputToPerson.get(id);
        if (person) this.schedulePersonUpdate(person);
    }

    onUnload(callback) {
        if (this.refreshTimer) this.clearInterval(this.refreshTimer);
        callback();
    }

    loadPeople() {
        const configured = Array.isArray(this.config.people) ? this.config.people : [];
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
        const configured = Array.isArray(this.config.places) ? this.config.places : [];
        const result = [];
        const usedIds = new Set();
        let homeAlreadySelected = false;

        for (const entry of configured) {
            const id = this.safeId(entry.id || entry.name);
            const latitude = Number(entry.latitude);
            const longitude = Number(entry.longitude);
            if (!id || !this.validCoordinates(latitude, longitude)) {
                this.log.warn(`Ort „${entry.name || entry.id || 'ohne Namen'}“ übersprungen: ID oder Koordinaten sind ungültig.`);
                continue;
            }
            if (usedIds.has(id)) {
                this.log.warn(`Ort mit doppelter ID „${id}“ übersprungen.`);
                continue;
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
                isHome
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
        await this.ensureChannel('persons', 'Personen');

        for (const person of this.people) {
            await this.ensureChannel(`persons.${person.id}`, person.name);
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

            for (const place of this.places) {
                await this.ensureChannel(`persons.${person.id}.places.${place.id}`, place.name);
                await this.ensureState(`persons.${person.id}.places.${place.id}.inside`, 'Innerhalb des Erkennungsradius', 'boolean', 'indicator');
                await this.ensureState(`persons.${person.id}.places.${place.id}.distance`, 'Luftlinienentfernung', 'number', 'value.distance', 'm');
            }
        }
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

        await this.setValue(`persons.${person.id}.presence.isHome`, !!homePlace && homePlace.distance <= homePlace.place.radius);
        await this.setValue(`persons.${person.id}.presence.currentPlace`, currentPlace ? currentPlace.place.name : 'not_home');
        await this.setValue(`persons.${person.id}.presence.lastUpdate`, Date.now());

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
        } else if (homePlace.distance <= homePlace.place.radius) {
            await this.setValue(`${travelBase}.minutes`, 0);
            await this.setValue(`${travelBase}.distance`, 0);
            await this.setValue(`${travelBase}.status`, 'Am Ziel');
        } else if (!this.config.routingEnabled) {
            await this.setValue(`${travelBase}.status`, 'Routenberechnung deaktiviert');
        } else {
            await this.setValue(`${travelBase}.status`, 'Wird berechnet');
            try {
                const route = await this.enqueueRoute(coordinates, homePlace.place);
                if (this.personGeneration.get(person.id) !== generation) return;

                const minutes = Math.round(route.duration / 60);
                await this.setValue(`${travelBase}.minutes`, minutes);
                await this.setValue(`${travelBase}.distance`, Math.round(route.distance / 100) / 10);
                await this.setValue(`${travelBase}.status`, route.provider === 'openrouteservice' ? 'OK (OpenRouteService)' : 'OK (OSRM)');
            } catch (error) {
                await this.setValue(`${travelBase}.status`, `Fehler: ${error.message || error}`);
                this.log.warn(`Routenberechnung für ${person.name} nach Hause fehlgeschlagen: ${error.message || error}`);
            }
        }
    }

    enqueueRoute(origin, destination) {
        return new Promise((resolve, reject) => {
            this.routeQueue.push({ origin, destination, resolve, reject });
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
                    job.resolve(await this.requestRoute(job.origin, job.destination));
                } catch (error) {
                    job.reject(error);
                }
            }
        } finally {
            this.routeQueueRunning = false;
            if (this.routeQueue.length) void this.processRouteQueue();
        }
    }

    async requestRoute(origin, destination) {
        let osrmError;
        try {
            return await this.requestOsrmRoute(origin, destination);
        } catch (error) {
            osrmError = error;
        }

        if (!this.config.useOpenRouteServiceFallback) throw osrmError;
        const apiKey = String(this.config.openRouteServiceApiKey || '').trim();
        if (!apiKey) {
            throw new Error(`OSRM: ${osrmError.message || osrmError}; OpenRouteService-Fallback ist aktiviert, aber es ist kein API-Schlüssel eingetragen`);
        }

        try {
            return await this.requestOpenRouteServiceRoute(origin, destination, apiKey);
        } catch (error) {
            throw new Error(`OSRM: ${osrmError.message || osrmError}; OpenRouteService: ${error.message || error}`);
        }
    }

    async requestOsrmRoute(origin, destination) {
        const baseUrl = String(this.config.routingUrl || 'https://router.project-osrm.org').replace(/\/+$/, '');
        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const url = `${baseUrl}/route/v1/driving/${coordinates}?overview=false&alternatives=false&steps=false`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'ioBroker.homeradar' },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Routingdienst antwortet mit HTTP ${response.status}`);

        const result = await response.json();
        if (result.code !== 'Ok' || !Array.isArray(result.routes) || !result.routes.length) {
            throw new Error('Keine Route gefunden');
        }
        return result.routes[0];
    }

    async requestOpenRouteServiceRoute(origin, destination, apiKey) {
        const response = await fetch('https://api.heigit.org/openrouteservice/v2/directions/driving-car', {
            method: 'POST',
            headers: {
                Authorization: apiKey,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                coordinates: [
                    [origin.longitude, origin.latitude],
                    [destination.longitude, destination.latitude]
                ]
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Routingdienst antwortet mit HTTP ${response.status}`);

        const result = await response.json();
        const summary = result.features?.[0]?.properties?.summary;
        if (!summary || !Number.isFinite(summary.duration) || !Number.isFinite(summary.distance)) {
            throw new Error('Keine gültige Route gefunden');
        }
        return { duration: summary.duration, distance: summary.distance, provider: 'openrouteservice' };
    }
}

if (require.main !== module) {
    module.exports = options => new HomeRadarAdapter(options);
} else {
    new HomeRadarAdapter();
}
