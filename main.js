"use strict";

const utils = require("@iobroker/adapter-core");

const ROUTE_REQUEST_GAP_MS = 1200;
const ADDRESS_COMPONENT_MAX_DISTANCE_METERS = 100;
const API_USAGE_COUNTERS = [
  "osrm.routing.successful",
  "osrm.routing.failed",
  "geoapify.routing.successful",
  "geoapify.routing.failed",
  "geoapify.addressLookup.successful",
  "geoapify.addressLookup.failed",
];

class HomeRadarAdapter extends utils.Adapter {
  constructor(options) {
    super({ ...options, name: "homeradar" });

    this.people = [];
    this.places = [];
    this.inputToPerson = new Map();
    this.personGeneration = new Map();
    this.pendingPeople = new Set();
    this.forceRefreshPeople = new Set();
    this.activePeople = new Set();
    this.routeCache = new Map();
    this.addressCache = new Map();
    this.presenceByPerson = new Map();
    this.homeSummaryUpdateRunning = false;
    this.homeSummaryUpdatePending = false;
    this.routeQueue = [];
    this.routeQueueRunning = false;
    this.lastRouteRequestAt = 0;
    this.apiUsageDate = "";
    this.apiUsageQueue = Promise.resolve();
    this.apiUsageRolloverTimer = null;

    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  async onReady() {
    await this.setState("info.connection", false, true);
    this.people = this.loadPeople();
    this.places = this.loadPlaces();
    await this.cleanupObsoleteObjects();
    await this.createOutputTree();
    await this.initializeApiUsage();

    for (const person of this.people) {
      this.inputToPerson.set(person.latitudeId, person);
      this.inputToPerson.set(person.longitudeId, person);
      this.subscribeForeignStates(person.latitudeId);
      this.subscribeForeignStates(person.longitudeId);
      this.subscribeStates(`persons.${person.id}.refresh`);
    }

    await this.setState("info.connection", true, true);
    for (const person of this.people) {
      this.schedulePersonUpdate(person);
    }
  }

  onStateChange(id, state) {
    if (!state) {
      return;
    }
    const person = this.inputToPerson.get(id);
    if (person) {
      this.schedulePersonUpdate(person);
      return;
    }

    const relativeId = id.startsWith(`${this.namespace}.`)
      ? id.slice(this.namespace.length + 1)
      : id;
    const refreshMatch = relativeId.match(/^persons\.([^.]+)\.refresh$/);
    if (refreshMatch && state.val === true && !state.ack) {
      const refreshPerson = this.people.find(
        (entry) => entry.id === refreshMatch[1],
      );
      void this.setValue(relativeId, false).catch((error) => {
        this.log.warn(
          `Aktualisierungsauslöser für ${refreshPerson?.name || refreshMatch[1]} konnte nicht zurückgesetzt werden: ${error.message || error}`,
        );
      });
      if (refreshPerson) {
        this.schedulePersonUpdate(refreshPerson, true);
      }
    }
  }

  getConfigValue(section, key, fallback) {
    const nested = this.config[section];
    const hasNestedValue =
      nested && Object.prototype.hasOwnProperty.call(nested, key);
    const hasRootValue = Object.prototype.hasOwnProperty.call(this.config, key);
    const nestedValue = hasNestedValue ? nested[key] : undefined;
    const rootValue = hasRootValue ? this.config[key] : undefined;

    if (
      Array.isArray(rootValue) &&
      rootValue.length > 0 &&
      Array.isArray(nestedValue) &&
      nestedValue.length === 0
    ) {
      return rootValue;
    }
    if (
      nestedValue === "" &&
      typeof rootValue === "string" &&
      rootValue.trim() !== ""
    ) {
      return rootValue;
    }
    if (hasRootValue && typeof rootValue === "boolean") {
      return rootValue;
    }
    if (hasNestedValue) {
      return nestedValue;
    }
    if (hasRootValue) {
      return rootValue;
    }
    return fallback;
  }

  onUnload(callback) {
    if (this.apiUsageRolloverTimer) {
      clearTimeout(this.apiUsageRolloverTimer);
    }
    callback();
  }

  loadPeople() {
    const people = this.getConfigValue("peopleTab", "people", []);
    const configured = Array.isArray(people) ? people : [];
    const result = [];
    const usedIds = new Set();

    for (const entry of configured) {
      const id = this.safeId(entry.id || entry.name);
      if (!id || !entry.latitudeId || !entry.longitudeId) {
        this.log.warn(
          `Person „${entry.name || entry.id || "ohne Namen"}“ übersprungen: ID und Koordinaten-Datenpunkte sind erforderlich.`,
        );
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
        longitudeId: String(entry.longitudeId).trim(),
        addressUpdateDistanceMeters: Math.max(
          1,
          Number(entry.addressUpdateDistanceMeters) || 100,
        ),
      });
    }
    return result;
  }

  loadPlaces() {
    const places = this.getConfigValue("placesTab", "places", []);
    const configured = Array.isArray(places) ? places : [];
    const result = [];
    const usedIds = new Set();
    let homeAlreadySelected = false;

    for (const entry of configured) {
      const id = this.safeId(entry.id || entry.name);
      const latitude = Number(entry.latitude);
      const longitude = Number(entry.longitude);
      let fallbackHomeDistanceKm = this.parseOptionalNonNegativeNumber(
        entry.fallbackHomeDistanceKm,
      );
      let fallbackHomeMinutes = this.parseOptionalNonNegativeNumber(
        entry.fallbackHomeMinutes,
      );
      if (!id || !this.validCoordinates(latitude, longitude)) {
        this.log.warn(
          `Ort „${entry.name || entry.id || "ohne Namen"}“ übersprungen: ID oder Koordinaten sind ungültig.`,
        );
        continue;
      }
      if (usedIds.has(id)) {
        this.log.warn(`Ort mit doppelter ID „${id}“ übersprungen.`);
        continue;
      }

      if (
        (fallbackHomeDistanceKm === null) !==
        (fallbackHomeMinutes === null)
      ) {
        this.log.warn(
          `Fallback für „${entry.name || id}“ wird ignoriert: Entfernung und Fahrzeit nach Hause müssen gemeinsam eingetragen werden.`,
        );
        fallbackHomeDistanceKm = null;
        fallbackHomeMinutes = null;
      }

      const isHome = entry.isHome === true && !homeAlreadySelected;
      if (entry.isHome === true && homeAlreadySelected) {
        this.log.warn(
          `Nur ein Ort kann als Zuhause markiert sein. „${entry.name || id}“ wird als normaler Ort behandelt.`,
        );
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
        fallbackHomeMinutes,
      });
    }
    return result;
  }

  safeId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  validCoordinates(latitude, longitude) {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  parseCoordinate(value) {
    if (typeof value === "string" && value.trim() === "") {
      return NaN;
    }
    const parsed =
      typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  parseOptionalNonNegativeNumber(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return null;
    }
    const parsed =
      typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  async ensureChannel(id, name) {
    await this.setObjectNotExists(id, {
      type: "channel",
      common: { name },
      native: {},
    });
  }

  async ensureState(id, name, type, role, unit) {
    await this.setObjectNotExists(id, {
      type: "state",
      common: {
        name,
        type,
        role,
        read: true,
        write: false,
        ...(unit ? { unit } : {}),
      },
      native: {},
    });
  }

  async ensureMinuteState(id, name) {
    await this.ensureState(id, name, "number", "value", "min");
    await this.extendObjectAsync(id, {
      common: { role: "value", unit: "min" },
    });
  }

  localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async ensureApiUsageTree(basePath) {
    const lastPathPart = basePath.split(".").at(-1);
    const channelName =
      lastPathPart === "today"
        ? "Heute"
        : /^\d{4}-\d{2}-\d{2}$/.test(lastPathPart)
          ? lastPathPart
          : "Tagesverlauf";
    await this.ensureChannel(basePath, channelName);
    for (const [branch, name] of [
      ["osrm", "OSRM"],
      ["osrm.routing", "Routen"],
      ["geoapify", "Geoapify"],
      ["geoapify.routing", "Routen"],
      ["geoapify.addressLookup", "Adressauflösung"],
    ]) {
      await this.ensureChannel(`${basePath}.${branch}`, name);
    }
    for (const counter of API_USAGE_COUNTERS) {
      const operation = counter.split(".").at(-1);
      const provider = counter.startsWith("osrm.") ? "OSRM" : "Geoapify";
      const kind = counter.includes("addressLookup")
        ? "Adressauflösung"
        : "Routenabfragen";
      const success = operation === "successful";
      await this.ensureState(
        `${basePath}.${counter}`,
        `${provider}: ${kind} ${success ? "erfolgreich" : "fehlgeschlagen"}`,
        "number",
        "value",
      );
    }
    await this.ensureState(
      `${basePath}.geoapify.credits`,
      "Geoapify-Credits dieses Tages",
      "number",
      "value",
    );
  }

  async initializeApiUsage() {
    await this.ensureChannel("apiUsage", "API-Aufrufstatistik");
    await this.ensureChannel("apiUsage.today", "Heute");
    await this.ensureApiUsageTree("apiUsage.today");
    await this.migrateApiUsageHistory();
    await this.ensureState(
      "apiUsage.today.date",
      "Datum der Tageszähler",
      "string",
      "text",
    );
    await this.delObjectAsync("apiUsage.total", { recursive: true });

    for (const counter of API_USAGE_COUNTERS) {
      const id = `apiUsage.today.${counter}`;
      if (!(await this.getStateAsync(id))) {
        await this.setValue(id, 0);
      }
    }
    if (!(await this.getStateAsync("apiUsage.today.geoapify.credits"))) {
      await this.setValue("apiUsage.today.geoapify.credits", 0);
    }

    const today = this.localDateKey();
    const dateState = await this.getStateAsync("apiUsage.today.date");
    this.apiUsageDate = dateState?.val === today ? today : "";
    if (!this.apiUsageDate) {
      if (dateState?.val) {
        await this.archiveApiUsageDay(String(dateState.val));
      }
      await this.resetTodayApiUsage(today);
    }
    this.scheduleApiUsageRollover();
  }

  async migrateApiUsageHistory() {
    const historyObject = await this.getObjectAsync("apiUsage.history");
    let history = [];

    if (historyObject?.type === "state") {
      const historyState = await this.getStateAsync("apiUsage.history");
      if (historyState?.val) {
        const parsed = JSON.parse(String(historyState.val));
        if (!Array.isArray(parsed)) {
          throw new Error("API-Tagesverlauf enthält kein JSON-Array");
        }
        history = parsed;
      }
    } else {
      for (const dateKey of await this.getDirectChildIds("apiUsage.history")) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          continue;
        }
        history.push(await this.readLegacyApiUsageDay(dateKey));
      }
      await this.delObjectAsync("apiUsage.history", { recursive: true });
    }

    history.sort((first, second) => second.date.localeCompare(first.date));
    await this.ensureState(
      "apiUsage.history",
      "Tagesverlauf der API-Aufrufe (JSON)",
      "string",
      "json",
    );
    await this.setValue("apiUsage.history", JSON.stringify(history));
  }

  async resetTodayApiUsage(dateKey) {
    for (const counter of API_USAGE_COUNTERS) {
      await this.setValue(`apiUsage.today.${counter}`, 0);
    }
    await this.setValue("apiUsage.today.geoapify.credits", 0);
    await this.setValue("apiUsage.today.date", dateKey);
    this.apiUsageDate = dateKey;
  }

  async readLegacyApiUsageDay(dateKey) {
    const day = {
      date: dateKey,
      osrm: { successful: 0, failed: 0 },
      geoapify: {
        routing: { successful: 0, failed: 0 },
        addressLookup: { successful: 0, failed: 0 },
        credits: 0,
      },
    };
    for (const counter of API_USAGE_COUNTERS) {
      const state = await this.getStateAsync(
        `apiUsage.history.${dateKey}.${counter}`,
      );
      const value = Number(state?.val);
      const count = Number.isFinite(value) ? value : 0;
      const parts = counter.split(".");
      if (parts[0] === "osrm") {
        day.osrm[parts.at(-1)] = count;
      } else {
        day.geoapify[parts[1]][parts.at(-1)] = count;
      }
    }
    const creditsState = await this.getStateAsync(
      `apiUsage.history.${dateKey}.geoapify.credits`,
    );
    const credits = Number(creditsState?.val);
    day.geoapify.credits = Number.isFinite(credits) ? credits : 0;
    return day;
  }

  async readTodayApiUsageDay(dateKey) {
    const day = {
      date: dateKey,
      osrm: { successful: 0, failed: 0 },
      geoapify: {
        routing: { successful: 0, failed: 0 },
        addressLookup: { successful: 0, failed: 0 },
        credits: 0,
      },
    };
    for (const counter of API_USAGE_COUNTERS) {
      const state = await this.getStateAsync(`apiUsage.today.${counter}`);
      const value = Number(state?.val);
      const count = Number.isFinite(value) ? value : 0;
      const parts = counter.split(".");
      if (parts[0] === "osrm") {
        day.osrm[parts.at(-1)] = count;
      } else {
        day.geoapify[parts[1]][parts.at(-1)] = count;
      }
    }
    const creditsState = await this.getStateAsync(
      "apiUsage.today.geoapify.credits",
    );
    const credits = Number(creditsState?.val);
    day.geoapify.credits = Number.isFinite(credits) ? credits : 0;
    return day;
  }

  async archiveApiUsageDay(dateKey) {
    if (!dateKey) {
      return;
    }
    const historyState = await this.getStateAsync("apiUsage.history");
    const parsed = historyState?.val
      ? JSON.parse(String(historyState.val))
      : [];
    if (!Array.isArray(parsed)) {
      throw new Error("API-Tagesverlauf enthält kein JSON-Array");
    }
    const history = parsed.filter((entry) => entry?.date !== dateKey);
    history.push(await this.readTodayApiUsageDay(dateKey));
    history.sort((first, second) => second.date.localeCompare(first.date));
    await this.setValue("apiUsage.history", JSON.stringify(history));
  }

  scheduleApiUsageRollover() {
    if (this.apiUsageRolloverTimer) {
      clearTimeout(this.apiUsageRolloverTimer);
    }
    const now = new Date();
    const archiveTime = new Date(now);
    archiveTime.setHours(23, 59, 0, 0);
    const isArchiveTime = archiveTime.getTime() > now.getTime();
    const nextRun = isArchiveTime ? archiveTime : new Date(now);
    if (!isArchiveTime) {
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(0, 0, 1, 0);
    }
    this.apiUsageRolloverTimer = setTimeout(
      () => {
        const task = this.apiUsageQueue.then(async () => {
          try {
            const today = this.localDateKey();
            if (isArchiveTime) {
              await this.archiveApiUsageDay(today);
            } else if (today !== this.apiUsageDate) {
              await this.archiveApiUsageDay(this.apiUsageDate);
              await this.resetTodayApiUsage(today);
            }
          } finally {
            this.scheduleApiUsageRollover();
          }
        });
        this.apiUsageQueue = task.catch((error) => {
          this.log.warn(
            `API-Statistik konnte nicht aktualisiert werden: ${error}`,
          );
        });
      },
      Math.max(1000, nextRun.getTime() - Date.now()),
    );
    this.apiUsageRolloverTimer.unref?.();
  }

  recordApiRequest(provider, operation, succeeded, credits = 0) {
    const task = this.apiUsageQueue.then(async () => {
      const today = this.localDateKey();
      if (today !== this.apiUsageDate) {
        await this.archiveApiUsageDay(this.apiUsageDate);
        await this.resetTodayApiUsage(today);
      }
      const status = succeeded ? "successful" : "failed";
      const counter = `${provider}.${operation}.${status}`;
      await this.incrementUsageState(`apiUsage.today.${counter}`);
      if (credits > 0) {
        await this.incrementUsageState(
          "apiUsage.today.geoapify.credits",
          credits,
        );
      }
    });
    this.apiUsageQueue = task.catch((error) => {
      this.log.warn(`API-Statistik konnte nicht aktualisiert werden: ${error}`);
    });
    return this.apiUsageQueue;
  }

  async incrementUsageState(id, amount = 1) {
    const current = await this.getStateAsync(id);
    const value = Number.isFinite(Number(current?.val))
      ? Number(current.val)
      : 0;
    await this.setValue(id, value + amount);
  }

  async getDirectChildIds(parentId) {
    const prefix = `${this.namespace}.${parentId}.`;
    const result = await this.getObjectListAsync({
      startkey: prefix,
      endkey: `${prefix}\u9999`,
    });
    const ids = new Set();
    for (const row of result?.rows || []) {
      if (typeof row.id !== "string" || !row.id.startsWith(prefix)) {
        continue;
      }
      const childId = row.id.slice(prefix.length).split(".")[0];
      if (childId) {
        ids.add(childId);
      }
    }
    return [...ids];
  }

  async cleanupObsoleteObjects() {
    const configuredPersonIds = new Set(this.people.map((person) => person.id));
    const configuredPlaceIds = new Set(this.places.map((place) => place.id));

    for (const personId of await this.getDirectChildIds("persons")) {
      if (!configuredPersonIds.has(personId)) {
        await this.delObjectAsync(`persons.${personId}`, { recursive: true });
      }
    }

    for (const person of this.people) {
      for (const childId of await this.getDirectChildIds(
        `persons.${person.id}.places`,
      )) {
        if (!configuredPlaceIds.has(childId)) {
          await this.delObjectAsync(`persons.${person.id}.places.${childId}`, {
            recursive: true,
          });
        }
      }
      await this.delObjectAsync(`persons.${person.id}.travelTimes`, {
        recursive: true,
      });
      await this.delObjectAsync(`persons.${person.id}.location.latitude`, {
        recursive: true,
      });
      await this.delObjectAsync(`persons.${person.id}.location.longitude`, {
        recursive: true,
      });
      await this.delObjectAsync(
        `persons.${person.id}.location.openStreetMapUrl`,
        { recursive: true },
      );
    }
  }

  async createOutputTree() {
    await this.delObjectAsync("summary.addresses", { recursive: true });
    await this.ensureChannel("summary", "Anwesenheitsübersicht");
    await this.ensureState(
      "summary.anyoneHome",
      "Mindestens eine Person zu Hause",
      "boolean",
      "indicator",
    );
    await this.ensureState(
      "summary.homeCount",
      "Anzahl der Personen zu Hause",
      "number",
      "value",
    );
    await this.ensureState(
      "summary.peopleAtHome",
      "Personen zu Hause",
      "string",
      "text",
    );
    await this.setValue("summary.anyoneHome", false);
    await this.setValue("summary.homeCount", 0);
    await this.setValue("summary.peopleAtHome", "");

    await this.ensureChannel("persons", "Personen");

    for (const person of this.people) {
      await this.ensureChannel(`persons.${person.id}`, person.name);
      const refreshId = `persons.${person.id}.refresh`;
      await this.ensureState(
        refreshId,
        "Standortdaten und Reisezeit aktualisieren",
        "boolean",
        "button",
      );
      await this.extendObjectAsync(refreshId, { common: { write: true } });
      await this.setValue(refreshId, false);
      await this.ensureChannel(
        `persons.${person.id}.location`,
        "Aktueller Standort",
      );
      await this.ensureChannel(
        `persons.${person.id}.location.coordinates`,
        "Koordinaten",
      );
      await this.ensureState(
        `persons.${person.id}.location.coordinates.latitude`,
        "Aktueller Breitengrad",
        "number",
        "value.gps.latitude",
        "°",
      );
      await this.ensureState(
        `persons.${person.id}.location.coordinates.longitude`,
        "Aktueller Längengrad",
        "number",
        "value.gps.longitude",
        "°",
      );
      await this.ensureChannel(`persons.${person.id}.location.map`, "Karte");
      await this.ensureState(
        `persons.${person.id}.location.map.openStreetMapUrl`,
        "Standort auf OpenStreetMap",
        "string",
        "text.url",
      );
      await this.ensureChannel(
        `persons.${person.id}.location.address`,
        "Adresse",
      );
      await this.ensureState(
        `persons.${person.id}.location.address.addressLine`,
        "Adresszeile",
        "string",
        "text",
      );
      await this.setValue(
        `persons.${person.id}.location.address.addressLine`,
        "N/A",
      );
      for (const [field, label] of Object.entries({
        formatted: "Vollständige Adresse",
        name: "Name des Ortes",
        street: "Straße",
        housenumber: "Hausnummer",
        postcode: "Postleitzahl",
        city: "Ort",
        suburb: "Ortsteil",
        district: "Stadtteil",
        county: "Landkreis",
        state: "Bundesland oder Region",
        country: "Land",
      })) {
        const addressId = `persons.${person.id}.location.address.${field}`;
        await this.ensureState(addressId, label, "string", "text");
        await this.setValue(addressId, "N/A");
      }
      await this.ensureState(
        `persons.${person.id}.location.address.status`,
        "Status der Adressauflösung",
        "string",
        "text",
      );
      await this.ensureState(
        `persons.${person.id}.location.address.lastUpdate`,
        "Letzte erfolgreiche Adressabfrage",
        "number",
        "date",
        "ms",
      );
      await this.ensureState(
        `persons.${person.id}.location.address.response`,
        "Vollständige Geoapify-Antwort (JSON)",
        "string",
        "text",
      );
      await this.ensureChannel(`persons.${person.id}.presence`, "Anwesenheit");
      await this.ensureState(
        `persons.${person.id}.presence.isHome`,
        "Ist zu Hause",
        "boolean",
        "indicator",
      );
      await this.ensureState(
        `persons.${person.id}.presence.currentPlace`,
        "Aktueller Aufenthaltsort",
        "string",
        "text",
      );
      await this.ensureState(
        `persons.${person.id}.presence.lastUpdate`,
        "Letzte Koordinatenprüfung",
        "number",
        "date",
        "ms",
      );
      await this.ensureChannel(`persons.${person.id}.places`, "Orte");
      await this.ensureChannel(
        `persons.${person.id}.travelTime`,
        "Reisezeiten",
      );
      await this.ensureChannel(
        `persons.${person.id}.travelTime.home`,
        "Nach Hause",
      );
      await this.ensureMinuteState(
        `persons.${person.id}.travelTime.home.minutes`,
        "Fahrzeit nach Hause",
      );
      await this.ensureState(
        `persons.${person.id}.travelTime.home.distance`,
        "Streckenlänge nach Hause",
        "number",
        "value.distance",
        "km",
      );
      await this.ensureState(
        `persons.${person.id}.travelTime.home.combined`,
        "Entfernung und Fahrzeit",
        "string",
        "text",
      );
      await this.ensureState(
        `persons.${person.id}.travelTime.home.lastUpdate`,
        "Letzte erfolgreiche Aktualisierung der Fahrzeit",
        "number",
        "date",
        "ms",
      );
      await this.ensureState(
        `persons.${person.id}.travelTime.home.status`,
        "Status der Routenberechnung nach Hause",
        "string",
        "text",
      );

      for (const place of this.places) {
        await this.ensureChannel(
          `persons.${person.id}.places.${place.id}`,
          place.name,
        );
        await this.ensureState(
          `persons.${person.id}.places.${place.id}.inside`,
          "Innerhalb des Erkennungsradius",
          "boolean",
          "indicator",
        );
        await this.ensureState(
          `persons.${person.id}.places.${place.id}.distance`,
          "Luftlinienentfernung",
          "number",
          "value.distance",
          "m",
        );
      }
    }
  }

  async updateHomeSummary() {
    if (this.homeSummaryUpdateRunning) {
      this.homeSummaryUpdatePending = true;
      return;
    }

    this.homeSummaryUpdateRunning = true;
    try {
      do {
        this.homeSummaryUpdatePending = false;
        const peopleAtHome = this.people
          .filter((person) => this.presenceByPerson.get(person.id) === true)
          .map((person) => person.name);
        await Promise.all([
          this.setValue("summary.anyoneHome", peopleAtHome.length > 0),
          this.setValue("summary.homeCount", peopleAtHome.length),
          this.setValue("summary.peopleAtHome", peopleAtHome.join(", ")),
        ]);
      } while (this.homeSummaryUpdatePending);
    } finally {
      this.homeSummaryUpdateRunning = false;
    }
  }

  schedulePersonUpdate(person, forceRefresh = false) {
    this.personGeneration.set(
      person.id,
      (this.personGeneration.get(person.id) || 0) + 1,
    );
    this.pendingPeople.add(person.id);
    if (forceRefresh) {
      this.forceRefreshPeople.add(person.id);
    }
    if (this.activePeople.has(person.id)) {
      return;
    }

    this.activePeople.add(person.id);
    void (async () => {
      while (this.pendingPeople.has(person.id)) {
        this.pendingPeople.delete(person.id);
        const generation = this.personGeneration.get(person.id);
        const refreshNow = this.forceRefreshPeople.delete(person.id);
        try {
          await this.updatePerson(person, generation, refreshNow);
        } catch (error) {
          this.log.warn(
            `Aktualisierung für ${person.name} fehlgeschlagen: ${error.message || error}`,
          );
        }
      }
      this.activePeople.delete(person.id);
    })();
  }

  async readPersonCoordinates(person) {
    const [latitudeState, longitudeState] = await Promise.all([
      this.getForeignStateAsync(person.latitudeId),
      this.getForeignStateAsync(person.longitudeId),
    ]);

    const latitude = latitudeState
      ? this.parseCoordinate(latitudeState.val)
      : NaN;
    const longitude = longitudeState
      ? this.parseCoordinate(longitudeState.val)
      : NaN;
    return this.validCoordinates(latitude, longitude)
      ? { latitude, longitude }
      : null;
  }

  distanceMeters(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async setValue(id, value) {
    await this.setState(id, value, true);
  }

  async updatePerson(person, generation, forceRefresh = false) {
    const coordinates = await this.readPersonCoordinates(person);
    if (!coordinates) {
      await this.setValue(
        `persons.${person.id}.presence.currentPlace`,
        "unterwegs",
      );
      await this.setValue(`persons.${person.id}.presence.isHome`, false);
      this.presenceByPerson.delete(person.id);
      await this.updateHomeSummary();
      return;
    }
    if (this.personGeneration.get(person.id) !== generation) {
      return;
    }

    const placeDistances = this.places.map((place) => ({
      place,
      distance: this.distanceMeters(
        coordinates.latitude,
        coordinates.longitude,
        place.latitude,
        place.longitude,
      ),
    }));
    const insidePlaces = placeDistances
      .filter((item) => item.distance <= item.place.radius)
      .sort((a, b) => a.distance - b.distance);
    const currentPlace = insidePlaces[0];
    const homePlace = placeDistances.find((item) => item.place.isHome);
    const isHome = !!homePlace && homePlace.distance <= homePlace.place.radius;

    await this.setValue(
      `persons.${person.id}.location.coordinates.latitude`,
      coordinates.latitude,
    );
    await this.setValue(
      `persons.${person.id}.location.coordinates.longitude`,
      coordinates.longitude,
    );
    await this.setValue(
      `persons.${person.id}.location.map.openStreetMapUrl`,
      this.openStreetMapUrl(coordinates),
    );
    await this.updatePersonAddress(person, coordinates, forceRefresh);
    this.presenceByPerson.set(person.id, isHome);
    await this.setValue(`persons.${person.id}.presence.isHome`, isHome);
    await this.setValue(
      `persons.${person.id}.presence.currentPlace`,
      currentPlace ? currentPlace.place.name : "unterwegs",
    );
    await this.setValue(`persons.${person.id}.presence.lastUpdate`, Date.now());
    await this.updateHomeSummary();

    for (const item of placeDistances) {
      if (this.personGeneration.get(person.id) !== generation) {
        return;
      }

      const place = item.place;
      const inside = item.distance <= place.radius;
      const placeBase = `persons.${person.id}.places.${place.id}`;

      await this.setValue(`${placeBase}.inside`, inside);
      await this.setValue(`${placeBase}.distance`, Math.round(item.distance));
    }

    const homeTravelBase = `persons.${person.id}.travelTime.home`;
    if (!homePlace) {
      await this.setValue(
        `${homeTravelBase}.status`,
        "Kein Zuhause-Ort konfiguriert",
      );
      return;
    }
    if (isHome) {
      await this.setValue(`${homeTravelBase}.minutes`, 0);
      await this.setValue(`${homeTravelBase}.distance`, 0);
      await this.setValue(`${homeTravelBase}.combined`, "0km / 0min");
      await this.setValue(`${homeTravelBase}.status`, "Am Ziel");
      await this.setValue(`${homeTravelBase}.lastUpdate`, Date.now());
      return;
    }

    if (!this.getConfigValue("routingTab", "routingEnabled", true)) {
      await this.setValue(
        `${homeTravelBase}.status`,
        "Routenberechnung deaktiviert",
      );
      return;
    }
    await this.setValue(`${homeTravelBase}.status`, "Wird berechnet");

    let matrix;
    let matrixError;
    try {
      matrix = await this.getPersonRouteMatrix(
        person,
        coordinates,
        forceRefresh,
      );
    } catch (error) {
      matrixError = error;
    }
    if (this.personGeneration.get(person.id) !== generation) {
      return;
    }

    const route = matrix?.routes[0];
    if (
      !route ||
      !Number.isFinite(route.duration) ||
      !Number.isFinite(route.distance)
    ) {
      const fallbackPlace = currentPlace?.place;
      const hasHomeFallback =
        fallbackPlace &&
        Number.isFinite(fallbackPlace.fallbackHomeDistanceKm) &&
        Number.isFinite(fallbackPlace.fallbackHomeMinutes);
      if (hasHomeFallback) {
        await this.setValue(
          `${homeTravelBase}.minutes`,
          fallbackPlace.fallbackHomeMinutes,
        );
        await this.setValue(
          `${homeTravelBase}.distance`,
          fallbackPlace.fallbackHomeDistanceKm,
        );
        await this.setValue(
          `${homeTravelBase}.combined`,
          `${Math.round(fallbackPlace.fallbackHomeDistanceKm)}km / ${Math.round(fallbackPlace.fallbackHomeMinutes)}min`,
        );
        await this.setValue(
          `${homeTravelBase}.status`,
          `Fallback: ${fallbackPlace.name}`,
        );
        await this.setValue(`${homeTravelBase}.lastUpdate`, Date.now());
      } else {
        await this.setValue(`${homeTravelBase}.combined`, "Nicht verfügbar");
        await this.setValue(
          `${homeTravelBase}.status`,
          matrixError
            ? `Fehler: ${matrixError.message || matrixError}`
            : "Keine Route gefunden",
        );
      }
    } else {
      await this.setValue(
        `${homeTravelBase}.minutes`,
        Math.round(route.duration / 60),
      );
      const roundedMinutes = Math.round(route.duration / 60);
      await this.setValue(
        `${homeTravelBase}.distance`,
        Math.round(route.distance / 100) / 10,
      );
      await this.setValue(
        `${homeTravelBase}.combined`,
        `${Math.round(route.distance / 1000)}km / ${roundedMinutes}min`,
      );
      const cacheLabel = matrix.cached ? "Zwischengespeichert" : "OK";
      const providerLabel =
        matrix.provider === "geoapify" ? "Geoapify" : "OSRM";
      await this.setValue(
        `${homeTravelBase}.status`,
        `${cacheLabel} (${providerLabel})`,
      );
      await this.setValue(`${homeTravelBase}.lastUpdate`, Date.now());
    }

    if (matrixError) {
      this.log.warn(
        `Routenmatrix für ${person.name} fehlgeschlagen: ${matrixError.message || matrixError}`,
      );
    }
  }

  openStreetMapUrl(coordinates) {
    const { latitude, longitude } = coordinates;
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
  }

  async updatePersonAddress(person, coordinates, forceRefresh = false) {
    if (!this.getConfigValue("routingTab", "useGeoapifyAddressLookup", false)) {
      return;
    }
    const apiKey = String(
      this.getConfigValue("routingTab", "geoapifyApiKey", "") || "",
    ).trim();
    if (!apiKey) {
      return;
    }
    const cached = this.addressCache.get(person.id);
    const addressUpdateDistanceMeters = person.addressUpdateDistanceMeters;
    if (
      !forceRefresh &&
      cached &&
      this.distanceMeters(
        cached.origin.latitude,
        cached.origin.longitude,
        coordinates.latitude,
        coordinates.longitude,
      ) < addressUpdateDistanceMeters
    ) {
      await this.setValue(
        `persons.${person.id}.location.address.status`,
        "Zwischengespeichert (Geoapify)",
      );
      return;
    }

    let responseSuccessful = false;
    let requestRecorded = false;
    try {
      const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
      url.searchParams.set("lat", String(coordinates.latitude));
      url.searchParams.set("lon", String(coordinates.longitude));
      url.searchParams.set("lang", "de");
      url.searchParams.set("apiKey", apiKey);
      const response = await fetch(url, {
        headers: { "User-Agent": "ioBroker.homeradar" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`Geoapify antwortet mit HTTP ${response.status}`);
      }
      responseSuccessful = true;
      await this.recordApiRequest("geoapify", "addressLookup", true, 1);
      requestRecorded = true;
      const result = await response.json();
      this.addressCache.set(person.id, { origin: { ...coordinates } });
      const responseJson = JSON.stringify(result);
      await this.setValue(
        `persons.${person.id}.location.address.response`,
        responseJson,
      );
      const properties = result.features?.[0]?.properties;
      if (!properties) {
        await this.writeAddressProperties(
          `persons.${person.id}.location.address`,
          {},
        );
        await this.setValue(
          `persons.${person.id}.location.address.addressLine`,
          "N/A",
        );
        await this.setValue(
          `persons.${person.id}.location.address.status`,
          "Keine Adresse gefunden",
        );
        await this.setValue(
          `persons.${person.id}.location.address.lastUpdate`,
          Date.now(),
        );
        return;
      }
      const addressProperties = { ...properties };
      const resultDistance = this.parseCoordinate(properties.distance);
      const streetAndHouseNumberTooFar =
        Number.isFinite(resultDistance) &&
        resultDistance > ADDRESS_COMPONENT_MAX_DISTANCE_METERS;
      if (streetAndHouseNumberTooFar) {
        addressProperties.street = null;
        addressProperties.housenumber = null;
        addressProperties.address_line1 = null;
        const locality = this.formatAddressLine(addressProperties);
        const postalLocality = [
          addressProperties.postcode,
          locality === "N/A" ? "" : locality,
        ]
          .filter(Boolean)
          .join(" ");
        const safeFormatted = [postalLocality, addressProperties.country]
          .filter(Boolean)
          .join(", ");
        addressProperties.formatted = safeFormatted || "N/A";
        addressProperties.address_line2 = safeFormatted || "N/A";
      }
      await this.writeAddressProperties(
        `persons.${person.id}.location.address`,
        addressProperties,
      );
      await this.setValue(
        `persons.${person.id}.location.address.addressLine`,
        this.formatAddressLine(addressProperties),
      );
      await this.setValue(
        `persons.${person.id}.location.address.status`,
        streetAndHouseNumberTooFar
          ? `OK (Geoapify; Straße/Hausnummer ausgeblendet, Treffer ${resultDistance.toFixed(1)} m entfernt)`
          : "OK (Geoapify)",
      );
      await this.setValue(
        `persons.${person.id}.location.address.lastUpdate`,
        Date.now(),
      );
    } catch (error) {
      if (!requestRecorded) {
        await this.recordApiRequest(
          "geoapify",
          "addressLookup",
          responseSuccessful,
          responseSuccessful ? 1 : 0,
        );
      }
      await this.setValue(
        `persons.${person.id}.location.address.status`,
        `Fehler: ${error.message || error}`,
      );
      this.log.warn(
        `Adressauflösung für ${person.name} fehlgeschlagen: ${error.message || error}`,
      );
    }
  }

  async writeAddressProperties(parentId, properties) {
    const germanNames = {
      address_line1: "Adresszeile 1",
      address_line2: "Adresszeile 2",
      country_code: "Ländercode",
      state_code: "Bundeslandcode",
      county_code: "Landkreiscode",
      name: "Name des Ortes",
      formatted: "Vollständige Adresse",
      housenumber: "Hausnummer",
      street: "Straße",
      postcode: "Postleitzahl",
      city: "Ort",
      town: "Stadt",
      village: "Dorf",
      suburb: "Ortsteil",
      district: "Stadtteil",
      quarter: "Stadtviertel",
      neighbourhood: "Stadtviertel",
      municipality: "Gemeinde",
      county: "Landkreis",
      state: "Bundesland oder Region",
      country: "Land",
    };
    const addressFields = new Set(Object.keys(germanNames));

    for (const [key, name] of Object.entries(germanNames)) {
      const id = `${parentId}.${this.safeId(key)}`;
      await this.ensureState(id, name, "string", "text");
      await this.setValue(id, "N/A");
    }

    for (const [key, value] of Object.entries(properties)) {
      if (!addressFields.has(key)) {
        continue;
      }
      const idPart = this.safeId(key);
      if (!idPart) {
        continue;
      }
      const id = `${parentId}.${idPart}`;
      const name = germanNames[key] || key;
      const isEmpty =
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);
      const storedValue = isEmpty
        ? "N/A"
        : Array.isArray(value)
          ? JSON.stringify(value)
          : value;
      const type =
        typeof storedValue === "number"
          ? "number"
          : typeof storedValue === "boolean"
            ? "boolean"
            : "string";
      const role =
        type === "number" ? "value" : type === "boolean" ? "indicator" : "text";
      await this.ensureState(id, name, type, role);
      await this.setValue(id, storedValue);
    }
  }

  formatAddressLine(properties) {
    const available = (value) => {
      if (value === null || value === undefined) {
        return "";
      }
      const text = String(value).trim();
      return !text || text.toUpperCase() === "N/A" ? "" : text;
    };
    const street = available(properties.street);
    const houseNumber = available(properties.housenumber);
    const city = available(properties.city);
    const village = available(properties.village);
    const streetPart = street
      ? [street, houseNumber].filter(Boolean).join(" ")
      : "";
    const localityPart = [city, village].filter(Boolean).join("-");
    return [streetPart, localityPart].filter(Boolean).join(", ") || "N/A";
  }

  async getPersonRouteMatrix(person, origin, forceRefresh = false) {
    const cached = this.routeCache.get(person.id);
    if (
      !forceRefresh &&
      cached &&
      this.distanceMeters(
        cached.origin.latitude,
        cached.origin.longitude,
        origin.latitude,
        origin.longitude,
      ) < 30
    ) {
      return { ...cached, cached: true };
    }

    const homePlace = this.places.find((place) => place.isHome);
    if (!homePlace) {
      throw new Error("Kein Zuhause-Ort konfiguriert");
    }
    const matrix = await this.enqueueRouteMatrix(origin, [homePlace]);
    this.routeCache.set(person.id, {
      origin: { ...origin },
      provider: matrix.provider,
      routes: matrix.routes,
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
    if (this.routeQueueRunning) {
      return;
    }
    this.routeQueueRunning = true;

    try {
      while (this.routeQueue.length) {
        const waitMs = Math.max(
          0,
          ROUTE_REQUEST_GAP_MS - (Date.now() - this.lastRouteRequestAt),
        );
        if (waitMs) {
          await this.delay(waitMs);
        }
        const job = this.routeQueue.shift();
        this.lastRouteRequestAt = Date.now();

        try {
          job.resolve(
            await this.requestRouteMatrix(job.origin, job.destinations),
          );
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      this.routeQueueRunning = false;
      if (this.routeQueue.length) {
        void this.processRouteQueue();
      }
    }
  }

  async requestRouteMatrix(origin, destinations) {
    const errors = [];
    try {
      return await this.requestOsrmMatrix(origin, destinations);
    } catch (error) {
      errors.push(`OSRM: ${error.message || error}`);
    }

    const useGeoapifyFallback = this.getConfigValue(
      "routingTab",
      "useGeoapifyRoutingFallback",
      false,
    );
    const geoapifyKey = useGeoapifyFallback
      ? String(
          this.getConfigValue("routingTab", "geoapifyApiKey", "") || "",
        ).trim()
      : "";
    if (geoapifyKey) {
      try {
        return await this.requestGeoapifyMatrix(
          origin,
          destinations,
          geoapifyKey,
        );
      } catch (error) {
        errors.push(`Geoapify: ${error.message || error}`);
      }
    }
    throw new Error(errors.join("; "));
  }

  async requestGeoapifyMatrix(origin, destinations, apiKey) {
    const url = new URL("https://api.geoapify.com/v1/routematrix");
    url.searchParams.set("apiKey", apiKey);
    let responseSuccessful = false;
    let requestRecorded = false;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "ioBroker.homeradar",
        },
        body: JSON.stringify({
          mode: "drive",
          sources: [{ location: [origin.longitude, origin.latitude] }],
          targets: destinations.map((place) => ({
            location: [place.longitude, place.latitude],
          })),
          units: "metric",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`Routingdienst antwortet mit HTTP ${response.status}`);
      }
      responseSuccessful = true;
      const result = await response.json();
      const routes = result.sources_to_targets?.[0];
      const distanceCredits = Array.isArray(routes)
        ? routes.reduce((sum, route) => {
            const distance = Number(route.distance);
            return Number.isFinite(distance) && distance >= 0
              ? sum + Math.floor(distance / 500000)
              : sum;
          }, 0)
        : 0;
      await this.recordApiRequest(
        "geoapify",
        "routing",
        true,
        1 + distanceCredits,
      );
      requestRecorded = true;
      if (!Array.isArray(routes) || routes.length !== destinations.length) {
        throw new Error("Keine gültige Routenmatrix erhalten");
      }
      return {
        provider: "geoapify",
        routes: routes.map((route) => ({
          duration: route.time,
          distance: route.distance,
        })),
      };
    } catch (error) {
      if (!requestRecorded) {
        await this.recordApiRequest(
          "geoapify",
          "routing",
          responseSuccessful,
          responseSuccessful ? 1 : 0,
        );
      }
      throw error;
    }
  }

  async requestOsrmMatrix(origin, destinations) {
    const baseUrl = String(
      this.getConfigValue(
        "routingTab",
        "routingUrl",
        "https://router.project-osrm.org",
      ) || "https://router.project-osrm.org",
    ).replace(/\/+$/, "");
    const locations = [origin, ...destinations]
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(";");
    const destinationIndexes = destinations
      .map((_, index) => index + 1)
      .join(";");
    const url = `${baseUrl}/table/v1/driving/${locations}?sources=0&destinations=${destinationIndexes}&annotations=duration,distance`;
    let requestRecorded = false;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "ioBroker.homeradar" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`Routingdienst antwortet mit HTTP ${response.status}`);
      }
      await this.recordApiRequest("osrm", "routing", true);
      requestRecorded = true;
      const result = await response.json();
      if (
        result.code !== "Ok" ||
        !Array.isArray(result.durations?.[0]) ||
        !Array.isArray(result.distances?.[0])
      ) {
        throw new Error("Keine gültige Routenmatrix erhalten");
      }
      return {
        provider: "osrm",
        routes: destinations.map((_, index) => ({
          duration: result.durations[0][index],
          distance: result.distances[0][index],
        })),
      };
    } catch (error) {
      if (!requestRecorded) {
        await this.recordApiRequest("osrm", "routing", false);
      }
      throw error;
    }
  }
}

if (require.main !== module) {
  module.exports = (options) => new HomeRadarAdapter(options);
} else {
  new HomeRadarAdapter();
}
