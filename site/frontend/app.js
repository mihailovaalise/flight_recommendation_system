const registerBtn = document.getElementById("register-btn");
const loginBtn = document.getElementById("login-btn");

const registerModal = document.getElementById("register-modal");
const loginModal = document.getElementById("login-modal");
const flightsModal = document.getElementById("flights-modal");
const quizPrompt = document.getElementById("quiz-prompt");

const closeModalBtn = document.getElementById("close-modal-btn");
const closeLoginModalBtn = document.getElementById("close-login-modal-btn");
const closeFlightsModalBtn = document.getElementById("close-flights-modal-btn");
const closeQuizPromptBtn = document.getElementById("close-quiz-prompt-btn");

const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");

const popularContainer = document.getElementById("popular-container");
const personalContainer = document.getElementById("recs-container");
const personalSection = document.getElementById("personal-section");
const loginStatus = document.getElementById("login-status");
const recsCaption = document.getElementById("recs-caption");

const flightsCardsContainer = document.getElementById("flights-cards-container");
const flightsModalTitle = document.getElementById("flights-modal-title");
const flightsModalSubtitle = document.getElementById("flights-modal-subtitle");

const regCityInput = document.getElementById("reg-city");
let moscowAirportGroup = document.getElementById("moscow-airport-group");
let regTimeOfDaySelect = document.getElementById("reg-time-of-day");
let regClassSelect = document.getElementById("reg-class");
let regDowCatSelect = document.getElementById("reg-dow-cat");
let regMoscowAirportSelect = document.getElementById("reg-moscow-airport");

const quizYesBtn = document.getElementById("quiz-yes-btn");
const quizNoBtn = document.getElementById("quiz-no-btn");
const quizText = document.getElementById("quiz-text");

const API_BASE = "http://127.0.0.1:8000";
const sortByTimeBtn = document.getElementById("sort-by-time-btn");

let currentFlightsToRender = [];
let currentIsPersonal = false;

(function ensureExtendedFieldsExist() {
  if (!registerForm) return;

  if (!regTimeOfDaySelect) {
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML = `
      <label for="reg-time-of-day">Когда удобнее вылетать?</label>
      <select id="reg-time-of-day" required>
        <option value="">Выберите</option>
        <option value="morning">Утром</option>
        <option value="afternoon">Днём</option>
        <option value="evening">Вечером</option>
        <option value="night">Ночью</option>
        <option value="any">Не важно</option>
      </select>
    `;
    registerForm.insertBefore(field, registerForm.lastElementChild);
  }

  if (!regClassSelect) {
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML = `
      <label for="reg-class">Какой класс предпочитаете?</label>
      <select id="reg-class" required>
        <option value="">Выберите</option>
        <option value="эконом">Эконом</option>
        <option value="комфорт">Комфорт</option>
        <option value="бизнес">Бизнес</option>
        <option value="any">Не важно</option>
      </select>
    `;
    registerForm.insertBefore(field, registerForm.lastElementChild);
  }

  if (!regDowCatSelect) {
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML = `
      <label for="reg-dow-cat">Когда удобнее лететь?</label>
      <select id="reg-dow-cat" required>
        <option value="">Выберите</option>
        <option value="weekday">В будни</option>
        <option value="weekend">В выходные</option>
        <option value="any">Не важно</option>
      </select>
    `;
    registerForm.insertBefore(field, registerForm.lastElementChild);
  }

  if (!moscowAirportGroup) {
    const group = document.createElement("div");
    group.id = "moscow-airport-group";
    group.className = "field hidden";
    group.innerHTML = `
      <label for="reg-moscow-airport">Какой аэропорт Москвы удобнее?</label>
      <select id="reg-moscow-airport">
        <option value="any">Не важно</option>
        <option value="SVO">Шереметьево</option>
        <option value="DME">Домодедово</option>
        <option value="VKO">Внуково</option>
      </select>
    `;
    registerForm.insertBefore(group, registerForm.lastElementChild);
  }

  moscowAirportGroup = document.getElementById("moscow-airport-group");
  regTimeOfDaySelect = document.getElementById("reg-time-of-day");
  regClassSelect = document.getElementById("reg-class");
  regDowCatSelect = document.getElementById("reg-dow-cat");
  regMoscowAirportSelect = document.getElementById("reg-moscow-airport");
})();

let sessionPreferences = {
  city: "",
  originCode: "",
  tripStyle: "",
  season: "",
  timeOfDay: "",
  bookingClass: "",
  dowCat: "",
  moscowAirport: "any",
  source: "survey",
  userId: "",
  preferredCabin: ""
};

let flightsDetailsMap = {};
let airportCodes = {};
let airportCityMap = {};
let flightsByRouteCode = {};
let userDataMap = null;
let pendingLoginUserId = "";
let pendingScenario = "";
let lastFetchedLoginRoutes = [];

const popularRoutes = [
  {
    routeCode: "MOW → AER",
    route: "Москва → Сочи",
    meta: "Самое популярное южное направление",
    score: "Южный"
  },
  {
    routeCode: "MOW → KHV",
    route: "Москва → Хабаровск",
    meta: "Популярный дальний маршрут",
    score: "Дальний"
  },
  {
    routeCode: "MOW → ABA",
    route: "Москва → Абакан",
    meta: "Популярное природное направление",
    score: "Природный"
  },
  {
    routeCode: "MOW → LED",
    route: "Москва → Санкт-Петербург",
    meta: "Популярное деловое направление",
    score: "Деловой"
  },
  {
    routeCode: "UFA → MOW",
    route: "Уфа → Москва",
    meta: "Популярное направление в столицу",
    score: "В столицу"
  }
];

const popularFlightsByRoute = {
  "MOW → ABA": [
    { flight_id: 47667, from: "DME", to: "ABA", flight_number: "4404" },
    { flight_id: 47565, from: "DME", to: "ABA", flight_number: "4404" },
    { flight_id: 47687, from: "DME", to: "ABA", flight_number: "4399" },
    { flight_id: 47520, from: "DME", to: "ABA", flight_number: "4389" },
    { flight_id: 47558, from: "DME", to: "ABA", flight_number: "4397" }
  ],
  "MOW → AER": [
    { flight_id: 48771, from: "DME", to: "AER", flight_number: "4421" },
    { flight_id: 48778, from: "DME", to: "AER", flight_number: "4421" },
    { flight_id: 48199, from: "DME", to: "AER", flight_number: "4432" },
    { flight_id: 260384, from: "VKO", to: "AER", flight_number: "24068" },
    { flight_id: 48640, from: "DME", to: "AER", flight_number: "4428" }
  ],
  "MOW → KHV": [
    { flight_id: 262775, from: "VKO", to: "KHV", flight_number: "24319" },
    { flight_id: 51026, from: "DME", to: "KHV", flight_number: "4664" },
    { flight_id: 206984, from: "SVO", to: "KHV", flight_number: "19236" },
    { flight_id: 51049, from: "DME", to: "KHV", flight_number: "4672" },
    { flight_id: 51116, from: "DME", to: "KHV", flight_number: "4665" }
  ],
  "MOW → LED": [
    { flight_id: 264294, from: "VKO", to: "LED", flight_number: "24424" },
    { flight_id: 52916, from: "DME", to: "LED", flight_number: "4759" },
    { flight_id: 53124, from: "DME", to: "LED", flight_number: "4760" },
    { flight_id: 53133, from: "DME", to: "LED", flight_number: "4771" },
    { flight_id: 53137, from: "DME", to: "LED", flight_number: "4775" }
  ],
  "UFA → MOW": [
    { flight_id: 249350, from: "UFA", to: "SVO", flight_number: "22617" },
    { flight_id: 241347, from: "UFA", to: "DME", flight_number: "22151" },
    { flight_id: 249332, from: "UFA", to: "SVO", flight_number: "22617" },
    { flight_id: 251572, from: "UFA", to: "VKO", flight_number: "22760" },
    { flight_id: 251899, from: "UFA", to: "VKO", flight_number: "22771" }
  ]
};

const destinationByStyle = {
  sea: [
    { code: "AER", city: "Сочи", meta: "Чёрное море, набережные и курортный отдых" },
    { code: "KGD", city: "Калининград", meta: "Балтийское море, побережье и морские курорты" },
    { code: "GDZ", city: "Геленджик", meta: "Южный отдых у моря и курортная атмосфера" },
    { code: "MCX", city: "Махачкала", meta: "Каспийское море и южное направление" }
  ],
  north: [
    { code: "KHV", city: "Хабаровск", meta: "Дальний северо-восточный маршрут" },
    { code: "MMK", city: "Мурманск", meta: "Север и природа, арктические пейзажи" },
    { code: "ARH", city: "Архангельск", meta: "Северное направление и Белое море" },
    { code: "ABA", city: "Абакан", meta: "Природа, озёра и сибирские маршруты" }
  ],
  lakes: [
    { code: "ABA", city: "Абакан", meta: "Природа, озёра и сибирские маршруты" },
    { code: "IKT", city: "Иркутск", meta: "Байкал, Ольхон и природные маршруты" },
    { code: "KHV", city: "Хабаровск", meta: "Дальневосточная природа и большие маршруты" },
    { code: "ARH", city: "Архангельск", meta: "Северная природа" }
  ],
  excursions: [
    { code: "LED", city: "Санкт-Петербург", meta: "Эрмитаж, Петергоф и классические экскурсии" },
    { code: "KZN", city: "Казань", meta: "Казанский Кремль, Свияжск и культурные поездки" },
    { code: "KGD", city: "Калининград", meta: "Куршская коса, Зеленоградск и экскурсионные маршруты" },
    { code: "AER", city: "Сочи", meta: "Городские прогулки, море и экскурсионный формат" }
  ],
  business: [
    { code: "LED", city: "Санкт-Петербург", meta: "Деловое направление и бизнес-поездки" },
    { code: "KZN", city: "Казань", meta: "Командировки и переговоры" },
    { code: "SVX", city: "Екатеринбург", meta: "Крупный деловой и промышленный центр" },
    { code: "AER", city: "Сочи", meta: "Альтернативное направление для деловых поездок и мероприятий" }
  ]
};

const cityToAirportCodeMap = {
  "москва": "MOW",
  "moscow": "MOW",
  "санкт-петербург": "LED",
  "петербург": "LED",
  "спб": "LED",
  "saint petersburg": "LED",
  "сочи": "AER",
  "sochi": "AER",
  "калининград": "KGD",
  "kaliningrad": "KGD",
  "архангельск": "ARH",
  "arkhangelsk": "ARH",
  "мурманск": "MMK",
  "murmansk": "MMK",
  "петрозаводск": "PES",
  "petrozavodsk": "PES",
  "иркутск": "IKT",
  "irkutsk": "IKT",
  "горно-алтайск": "RGK",
  "gorno-altaysk": "RGK",
  "махачкала": "MCX",
  "makhachkala": "MCX",
  "геленджик": "GDZ",
  "gelendzhik": "GDZ",
  "казань": "KZN",
  "kazan": "KZN",
  "екатеринбург": "SVX",
  "yekaterinburg": "SVX",
  "уфа": "UFA",
  "ufa": "UFA",
  "абакан": "ABA",
  "abakan": "ABA",
  "хабаровск": "KHV",
  "khabarovsk": "KHV"
};

function isMoscowCity(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["москва", "moscow"].includes(normalized);
}

if (regCityInput && moscowAirportGroup) {
  regCityInput.addEventListener("input", () => {
    if (isMoscowCity(regCityInput.value)) {
      moscowAirportGroup.classList.remove("hidden");
    } else {
      moscowAirportGroup.classList.add("hidden");
      regMoscowAirportSelect.value = "any";
    }
  });
}

async function loadAirportCodes() {
  try {
    const response = await fetch("./airport_codes.json");
    if (!response.ok) throw new Error("airport_codes.json not found");
    airportCodes = await response.json();
  } catch (error) {
    console.error("Ошибка загрузки airport_codes.json:", error);
    airportCodes = {};
  }
}

async function loadAirportCityMap() {
  try {
    const response = await fetch("./airport_city_map.json");
    if (!response.ok) throw new Error("airport_city_map.json not found");
    airportCityMap = await response.json();
  } catch (error) {
    console.error("Ошибка загрузки airport_city_map.json:", error);
    airportCityMap = {};
  }
}

async function loadFlightsDetails() {
  try {
    const response = await fetch("./flights_front_enriched.json");
    if (!response.ok) throw new Error("flights_front_enriched.json not found");
    const flights = await response.json();

    flightsDetailsMap = Object.fromEntries(
      flights.map((item) => [String(item.flight_id), item])
    );

    flightsByRouteCode = flights.reduce((acc, item) => {
      const key = String(item.route_code || "").trim().toUpperCase();
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  } catch (error) {
    console.error("Ошибка загрузки flights_front_enriched.json:", error);
    flightsDetailsMap = {};
    flightsByRouteCode = {};
  }
}

async function loadUserDataMap() {
  if (userDataMap) return userDataMap;
  try {
    const response = await fetch("./users_data.json");
    if (!response.ok) throw new Error("users_data.json not found");
    userDataMap = await response.json();
    return userDataMap;
  } catch (error) {
    console.error("Ошибка загрузки users_data.json:", error);
    userDataMap = {};
    return userDataMap;
  }
}

async function getUserScenario(userId) {
  const data = await loadUserDataMap();
  return data?.[String(userId)] || null;
}

function getAirportInfo(code) {
  return airportCodes[code] || null;
}

function getAirportDisplayName(code) {
  const normalized = String(code || "").trim().toUpperCase();
  const airport = getAirportInfo(normalized);
  if (!airport) return normalized;
  return airport.name || airport.city || normalized;
}

function getCityByCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  return airportCityMap[normalized]?.city || normalized;
}

function getRouteCitiesFromCode(routeCode) {
  const normalized = String(routeCode || "").trim().toUpperCase();
  if (!normalized.includes("→")) return normalized;

  const [fromCode, toCode] = normalized.split("→").map((s) => s.trim());
  const fromCity = getCityByCode(fromCode);
  const toCity = getCityByCode(toCode);

  return `${fromCity} → ${toCity}`;
}

function mapCityToOrigin(city) {
  const normalized = String(city || "").trim().toLowerCase();
  return cityToAirportCodeMap[normalized] || "MOW";
}

function normalizeRouteCode(fromCode, toCode) {
  const from = String(fromCode || "").trim().toUpperCase();
  const to = String(toCode || "").trim().toUpperCase();

  if (["DME", "SVO", "VKO"].includes(from)) return `MOW → ${to}`;
  if (["DME", "SVO", "VKO"].includes(to)) return `${from} → MOW`;
  return `${from} → ${to}`;
}

function getFlightsForRoute(routeCode) {
  const normalized = String(routeCode || "").trim().toUpperCase();
  if (!normalized) return [];

  const parts = normalized.split("→").map((s) => s.trim());
  if (parts.length !== 2) return flightsByRouteCode[normalized] || [];

  const [fromCode, toCode] = parts;
  const moscowAirports = ["DME", "SVO", "VKO"];

  const fromVariants = fromCode === "MOW" ? ["MOW", ...moscowAirports] : [fromCode];
  const toVariants = toCode === "MOW" ? ["MOW", ...moscowAirports] : [toCode];

  const result = [];

  for (const fromVariant of fromVariants) {
    for (const toVariant of toVariants) {
      const key = `${fromVariant} → ${toVariant}`;
      const flights = flightsByRouteCode[key] || [];
      result.push(...flights);
    }
  }

  const seen = new Set();
  return result.filter((flight) => {
    const id = String(flight.flight_id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeBookingClass(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v.includes("бизн")) return "бизнес";
  if (v.includes("комфорт")) return "комфорт";
  if (v.includes("эконом")) return "эконом";
  return "any";
}

function normalizeTimeOfDay(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["morning", "утро", "утром"].includes(v)) return "morning";
  if (["afternoon", "day", "день", "днём", "днем"].includes(v)) return "afternoon";
  if (["evening", "вечер", "вечером"].includes(v)) return "evening";
  if (["night", "ночь", "ночью"].includes(v)) return "night";
  return "any";
}

function normalizeDowCat(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["weekday", "будни", "в будни"].includes(v)) return "weekday";
  if (["weekend", "выходные", "в выходные"].includes(v)) return "weekend";
  return "any";
}

function normalizeWeekPart(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["start_week", "начало_недели"].includes(v)) return "start_week";
  if (["mid_week", "середина_недели"].includes(v)) return "mid_week";
  if (["end_week", "конец_недели"].includes(v)) return "end_week";
  return "unknown";
}

function scoreFlightBySessionPreferences(flight, prefs) {
  let score = 0;

  const flightFrom = String(
    flight["Аэропорт вылета"] || flight.from || ""
  ).toUpperCase();

  const flightTime = normalizeTimeOfDay(
    flight.time_of_day || flight["time_of_day"] || ""
  );

  const flightSeason = String(
    flight.season || flight["season"] || ""
  ).trim().toLowerCase();

  const flightWeekPart = normalizeWeekPart(
    flight.week_part_ru || flight["week_part_ru"] || flight.week_part || ""
  );

  if (prefs.timeOfDay && prefs.timeOfDay !== "any" && flightTime === prefs.timeOfDay) {
    score += 3;
  }

  if (prefs.season && prefs.season !== "all_year" && prefs.season !== "any" && flightSeason === prefs.season) {
    score += 2;
  }

  if (prefs.dowCat && prefs.dowCat !== "any") {
    if (prefs.dowCat === "weekday" && ["start_week", "mid_week"].includes(flightWeekPart)) {
      score += 2;
    }
    if (prefs.dowCat === "weekend" && flightWeekPart === "end_week") {
      score += 2;
    }
  }

  if (
    prefs.originCode &&
    ["MOW", "DME", "SVO", "VKO"].includes(prefs.originCode) &&
    prefs.moscowAirport &&
    prefs.moscowAirport !== "any" &&
    flightFrom === prefs.moscowAirport
  ) {
    score += 4;
  }

  return score;
}

function parseUiDepartureDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh, min] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
}

function getFlightDepartureTime(flight, details) {
  return (
    details["ДатаВремя вылета UI"] ||
    details["ДатаВремя вылетаUI"] ||
    flight["ДатаВремя вылета UI"] ||
    flight["ДатаВремя вылетаUI"] ||
    flight.departure_datetime_ui ||
    flight.departure_time_ui ||
    "Время не указано"
  );
}

function getFlightDepartureDateObject(flight) {
  const details = flightsDetailsMap[String(flight.flight_id)] || {};
  const departureText = getFlightDepartureTime(flight, details);
  return parseUiDepartureDate(departureText);
}

function getRandomSample(array, sampleSize) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, sampleSize);
}

function sortFlightsByNearestDeparture(flights) {
  return [...flights].sort((a, b) => {
    const aDate = getFlightDepartureDateObject(a);
    const bDate = getFlightDepartureDateObject(b);

    const aTime = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;
  });
}

function sortFlightsByDeparture(flights) {
  return [...flights].sort((a, b) => {
    const aDate = getFlightDepartureDateObject(a);
    const bDate = getFlightDepartureDateObject(b);

    const aTime = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;
  });
}

function getBestMatchingFlights(flights, prefs) {
  const scoredFlights = flights.map((flight) => ({
    ...flight,
    sessionScore: scoreFlightBySessionPreferences(flight, prefs)
  }));

  const maxScore = scoredFlights.reduce(
    (max, flight) => Math.max(max, flight.sessionScore || 0),
    0
  );

  if (maxScore > 0) {
    return scoredFlights.filter((flight) => (flight.sessionScore || 0) === maxScore);
  }

  return scoredFlights;
}

function scoreRouteByPreferences(routeCode, prefs) {
  const flights = getFlightsForRoute(routeCode);
  if (!flights.length) return -1;

  const scoredFlights = flights.map((flight) => ({
    ...flight,
    sessionScore: scoreFlightBySessionPreferences(flight, prefs)
  }));

  if (!scoredFlights.length) return -1;

  const topFlightScore = Math.max(...scoredFlights.map((f) => f.sessionScore || 0));
  const matchedFlightsCount = scoredFlights.filter((f) => (f.sessionScore || 0) === topFlightScore).length;

  return topFlightScore * 10 + matchedFlightsCount;
}

function buildStarterRecommendations(city, tripStyle) {
  const originName = (city || "").trim() || "Москва";
  const originCode = mapCityToOrigin(originName);
  const destinations = destinationByStyle[tripStyle] || destinationByStyle.excursions;

  const candidates = [];

  for (const item of destinations) {
    if (item.code === originCode) continue;

    const routeCode = normalizeRouteCode(originCode, item.code);
    const routeFlights = getFlightsForRoute(routeCode);

    if (!routeFlights.length) continue;

    const routeScore = scoreRouteByPreferences(routeCode, sessionPreferences);

    candidates.push({
      routeCode,
      route: `${originName} → ${item.city}`,
      meta: item.meta,
      isPersonal: true,
      routeScore
    });
  }

  candidates.sort((a, b) => b.routeScore - a.routeScore);
  return candidates.slice(0, 3);
}

function scoreLoginRouteWithSurveyPrefs(routeItem, prefs) {
  let score = 0;
  const routeCode = String(routeItem.routeCode || "").toUpperCase();
  const routeTitle = String(routeItem.route || "").toLowerCase();
  const metaText = String(routeItem.meta || "").toLowerCase();

  const flights = getFlightsForRoute(routeCode);
  if (flights.length) {
    const flightScore = scoreRouteByPreferences(routeCode, prefs);
    if (flightScore > 0) score += flightScore;
  }

  if (prefs.tripStyle === "sea") {
    ["сочи", "калининград", "геленджик", "махачкала", "aer", "kgd", "gdz", "mcx"].forEach((word) => {
      if (routeTitle.includes(word) || routeCode.includes(word.toUpperCase()) || metaText.includes(word)) score += 8;
    });
  }

  if (prefs.tripStyle === "north") {
    ["хабаровск", "мурманск", "архангельск", "абакан", "khv", "mmk", "arh", "aba"].forEach((word) => {
      if (routeTitle.includes(word) || routeCode.includes(word.toUpperCase()) || metaText.includes(word)) score += 8;
    });
  }

  if (prefs.tripStyle === "lakes") {
    ["абакан", "иркутск", "байкал", "архангельск", "aba", "ikt", "arh"].forEach((word) => {
      if (routeTitle.includes(word) || routeCode.includes(word.toUpperCase()) || metaText.includes(word)) score += 8;
    });
  }

  if (prefs.tripStyle === "excursions") {
    ["санкт", "казань", "калининград", "сочи", "led", "kzn", "kgd", "aer"].forEach((word) => {
      if (routeTitle.includes(word) || routeCode.includes(word.toUpperCase()) || metaText.includes(word)) score += 8;
    });
  }

  if (prefs.tripStyle === "business") {
    ["санкт", "казань", "екатеринбург", "сочи", "led", "kzn", "svx", "aer"].forEach((word) => {
      if (routeTitle.includes(word) || routeCode.includes(word.toUpperCase()) || metaText.includes(word)) score += 8;
    });
  }

  if (prefs.city) {
    const city = String(prefs.city).trim().toLowerCase();
    if (routeTitle.includes(city)) score += 4;
  }

  return score;
}

function rerankLoginRoutesBySurvey(routes, prefs) {
  return routes
    .map((item) => ({
      ...item,
      localSurveyScore: scoreLoginRouteWithSurveyPrefs(item, prefs)
    }))
    .sort((a, b) => (b.localSurveyScore || 0) - (a.localSurveyScore || 0))
    .slice(0, 9);
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
}

registerBtn?.addEventListener("click", () => {
  pendingScenario = "new_user";
  pendingLoginUserId = "";
  sessionPreferences = {
    ...sessionPreferences,
    source: "survey",
    userId: "",
    preferredCabin: ""
  };
  openModal(registerModal);
});

loginBtn?.addEventListener("click", () => openModal(loginModal));

closeModalBtn?.addEventListener("click", () => closeModal(registerModal));
closeLoginModalBtn?.addEventListener("click", () => closeModal(loginModal));
closeFlightsModalBtn?.addEventListener("click", () => closeModal(flightsModal));
if (closeQuizPromptBtn) {
  closeQuizPromptBtn.addEventListener("click", () => closeModal(quizPrompt));
}

[registerModal, loginModal, flightsModal, quizPrompt].forEach((modal) => {
  if (!modal) return;
  modal.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      closeModal(modal);
    }
  });
});

function createRecommendationCard(
  item,
  withButton = false,
  onClick = null,
  buttonText = "Выбрать рейс"
) {
  const card = document.createElement("div");
  card.className = "rec-card";

  const route = document.createElement("div");
  route.className = "rec-route";
  route.textContent = item.route;

  const meta = document.createElement("div");
  meta.className = "rec-meta";
  meta.textContent = item.meta;

  card.appendChild(route);
  card.appendChild(meta);

  if (item.extra) {
    const extra = document.createElement("div");
    extra.className = "rec-meta";
    extra.textContent = item.extra;
    card.appendChild(extra);
  }

  if (item.classes) {
    const classes = document.createElement("div");
    classes.className = "rec-meta rec-classes";
    classes.textContent = item.classes;
    card.appendChild(classes);
  }

  if (item.score) {
    const score = document.createElement("div");
    score.className = "rec-score";
    score.textContent = item.score;
    card.appendChild(score);
  }

  if (withButton) {
    const actions = document.createElement("div");
    actions.className = "rec-actions";

    const button = document.createElement("button");
    button.className = "rec-button";
    button.textContent = buttonText;

    if (onClick) {
      button.addEventListener("click", onClick);
    } else {
      button.disabled = true;
      button.style.opacity = "1";
      button.style.cursor = "default";
    }

    actions.appendChild(button);
    card.appendChild(actions);
  }

  return card;
}

function setSortButtonVisible(visible) {
  if (!sortByTimeBtn) return;
  sortByTimeBtn.style.display = visible ? "inline-flex" : "none";
}

function renderPopularRoutes() {
  if (!popularContainer) return;
  popularContainer.innerHTML = "";

  popularRoutes.forEach((routeItem) => {
    const card = createRecommendationCard(
      routeItem,
      true,
      () => openFlightsForRoute({ ...routeItem, isPersonal: false }),
      "Выбрать рейс"
    );
    popularContainer.appendChild(card);
  });
}

function renderPersonalRecommendations(items, caption = "") {
  personalSection?.classList.remove("hidden-section");
  personalContainer.innerHTML = "";
  if (recsCaption) recsCaption.textContent = caption;

  if (!items.length) {
    const emptyCard = createRecommendationCard({
      route: "Подходящие маршруты не найдены",
      meta: "Попробуйте изменить сезон, время вылета или тип поездки.",
      score: ""
    });
    personalContainer.appendChild(emptyCard);
    return;
  }

  items.forEach((item) => {
    const card = createRecommendationCard(
      item,
      true,
      () => openFlightsForRoute(item),
      "Выбрать рейс"
    );
    personalContainer.appendChild(card);
  });
}

function renderNoDataCard(routeText) {
  const emptyCard = createRecommendationCard({
    route: routeText || "Нет данных",
    meta: "Для этого маршрута пока не найдено подходящих рейсов.",
    score: ""
  });
  flightsCardsContainer.appendChild(emptyCard);
}

function appendPopularImageCard() {
  const imageCard = document.createElement("div");
  imageCard.className = "rec-card image-card";

  const image = document.createElement("img");
  image.src = "./99.png";
  image.alt = "";
  image.className = "image-card-img";

  imageCard.appendChild(image);
  flightsCardsContainer.appendChild(imageCard);
}

function renderFlightsRaw() {
  flightsCardsContainer.innerHTML = "";
  renderFlightCards(currentFlightsToRender, currentIsPersonal);

  if (!currentIsPersonal) {
    appendPopularImageCard();
  }
}

function renderFlightsSorted() {
  flightsCardsContainer.innerHTML = "";
  const sortedFlights = sortFlightsByDeparture(currentFlightsToRender);
  renderFlightCards(sortedFlights, currentIsPersonal);

  if (!currentIsPersonal) {
    appendPopularImageCard();
  }
}

function trimFlightsToMultipleOfThree(flights) {
  if (flights.length < 3) return flights;
  const countMultipleOfThree = Math.floor(flights.length / 3) * 3;
  return flights.slice(0, countMultipleOfThree);
}

function getPersonalizedClassesText(preferredCabin) {
  const orderedCabins = ["Эконом", "Комфорт", "Бизнес"];
  const normalized = String(preferredCabin || "").trim();

  if (!orderedCabins.includes(normalized)) {
    return "Доступны классы: Эконом, Комфорт, Бизнес";
  }

  const others = orderedCabins.filter((cabin) => cabin !== normalized);
  return `Доступен ${normalized}, также ${others.join(" и ")}`;
}

async function fetchRoutesForLoginUser(userId, topK = 9) {
  const response = await fetch(
    `${API_BASE}/api/recommend_routes?user_id=${encodeURIComponent(String(userId))}&top_k=${topK}`
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

async function fetchRankedFlightsForLoginUser(userId, routeCode, topK = 9) {
  const response = await fetch(
    `${API_BASE}/api/recommend_flights?user_id=${encodeURIComponent(String(userId))}&route_id=${encodeURIComponent(routeCode)}&top_k=${topK}`
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    flights: Array.isArray(data.flights) ? data.flights : [],
    preferredCabin: data.preferred_cabin || ""
  };
}

function renderFlightCards(rankedFlights, isPersonal) {
  rankedFlights.forEach((flight) => {
    const details = flightsDetailsMap[String(flight.flight_id)] || {};

    const fromCode =
      details["Аэропорт вылета"] || flight.from || flight["Аэропорт вылета"];
    const toCode =
      details["Аэропорт прилета"] || flight.to || flight["Аэропорт прилета"];

    const airportRouteText = `${getAirportDisplayName(fromCode)} → ${getAirportDisplayName(toCode)}`;

    const flightNumber =
      details["Номер рейса UI"] ||
      flight["Номер рейса UI"] ||
      (flight.flight_number ? `SU${flight.flight_number}` : `SU${String(flight.flight_id).slice(-5)}`);

    const departureTime = getFlightDepartureTime(flight, details);

    const classesText = isPersonal
      ? getPersonalizedClassesText(sessionPreferences.preferredCabin)
      : "Доступны классы: Эконом, Комфорт, Бизнес";

    const card = createRecommendationCard(
      {
        route: airportRouteText,
        meta: departureTime,
        extra: flightNumber,
        classes: classesText,
        score: ""
      },
      true,
      null,
      "Купить билет"
    );

    flightsCardsContainer.appendChild(card);
  });
}

async function openFlightsForRoute(routeItem) {
  const routeCode = routeItem.routeCode;
  const fallbackTitle = routeItem.route || routeCode || "Маршрут";
  const fallbackSubtitle = routeItem.meta || "Подобранный маршрут";
  const isPersonal = Boolean(routeItem.isPersonal);
  const isLoginPersonal = isPersonal && sessionPreferences.source === "login";
  const isSurveyPersonal = isPersonal && !isLoginPersonal;

  if (isPersonal) {
    flightsModalTitle.textContent = "Рейсы, подобранные для вас";
    flightsModalSubtitle.textContent = fallbackTitle;
  } else {
    flightsModalTitle.textContent = `Топ рейсы: ${fallbackTitle}`;
    flightsModalSubtitle.textContent = fallbackSubtitle;
  }

  flightsCardsContainer.innerHTML = "";

  try {
    if (isLoginPersonal && sessionPreferences.userId) {
    const result = await fetchRankedFlightsForLoginUser(
      sessionPreferences.userId,
      routeCode,
      9
    );

    sessionPreferences.preferredCabin = result.preferredCabin || "";
    currentFlightsToRender = Array.isArray(result.flights) ? result.flights : [];
    currentIsPersonal = true;

    setSortButtonVisible(true);
    renderFlightsRaw();
    openModal(flightsModal);
    return;
    } else if (isSurveyPersonal) {
      sessionPreferences.preferredCabin = normalizeBookingClass(sessionPreferences.bookingClass)
        .replace("эконом", "Эконом")
        .replace("комфорт", "Комфорт")
        .replace("бизнес", "Бизнес");

      const flights = getFlightsForRoute(routeCode);

      if (!flights.length) {
        renderNoDataCard(fallbackTitle);
        openModal(flightsModal);
        return;
      }

      const bestMatchingFlights = getBestMatchingFlights(flights, sessionPreferences);
      const randomTen = getRandomSample(bestMatchingFlights, 10);
      const trimmed = trimFlightsToMultipleOfThree(randomTen);

      currentFlightsToRender = trimmed;
      currentIsPersonal = true;

      setSortButtonVisible(false);
      renderFlightsSorted();
      openModal(flightsModal);
      return;
    } else {
      // топ‑рейсы — как есть, без сортировки
      const flights = popularFlightsByRoute[routeCode] || [];
      currentFlightsToRender = flights.slice(0, 5);
      currentIsPersonal = false;
      setSortButtonVisible(true); // топ — кнопку показываем
    }

    if (!currentFlightsToRender.length) {
      flightsCardsContainer.innerHTML = "";
      renderNoDataCard(fallbackTitle);

      if (!isPersonal) {
        appendPopularImageCard();
      }

      openModal(flightsModal);
      return;
    }

    // для топ‑рейсов: без сортировки по умолчанию
    renderFlightsRaw();
    openModal(flightsModal);
  } catch (error) {
    console.error(error);
    renderNoDataCard(fallbackTitle);

    if (!isPersonal) {
      appendPopularImageCard();
    }

    openModal(flightsModal);
  }
}

function showQuizPrompt() {
  if (!quizPrompt) return;
  if (quizText) {
    quizText.textContent = "У вас мало истории перелётов, поэтому короткий тест поможет точнее подобрать рекомендации.";
  }
  quizPrompt.classList.remove("hidden");
}

function hideQuizPrompt() {
  if (!quizPrompt) return;
  quizPrompt.classList.add("hidden");
}

function buildPersonalRouteItemsFromApi(routes) {
  return routes.map((item) => {
    const routeCode = String(item.route_id || "").trim().toUpperCase();
    const routeTitle = getRouteCitiesFromCode(routeCode);

    return {
      routeCode,
      route: routeTitle,
      meta: "",
      score: "",
      isPersonal: true
    };
  });
}

async function renderDirectLoginRecommendations(userId) {
  const data = await fetchRoutesForLoginUser(userId, 9);
  const routes = Array.isArray(data.routes) ? data.routes : [];
  lastFetchedLoginRoutes = buildPersonalRouteItemsFromApi(routes);

  if (!lastFetchedLoginRoutes.length) {
    renderPersonalRecommendations([], "Персональные рекомендации");
    return;
  }

  renderPersonalRecommendations(
    lastFetchedLoginRoutes,
    "Персональные рекомендации по вашей истории"
  );
}

function openSurveyForLightNewbie() {
  hideQuizPrompt();
  pendingScenario = "light_newbie";
  sessionPreferences = {
    ...sessionPreferences,
    source: "survey_from_login",
    userId: pendingLoginUserId,
    preferredCabin: ""
  };
  openModal(registerModal);
}

if (quizYesBtn) {
  quizYesBtn.addEventListener("click", () => {
    openSurveyForLightNewbie();
  });
}

if (quizNoBtn) {
  quizNoBtn.addEventListener("click", async () => {
    hideQuizPrompt();
    try {
      await renderDirectLoginRecommendations(pendingLoginUserId);
      loginStatus.textContent = `Вошли как ${pendingLoginUserId}. Персональные рекомендации загружены.`;
      closeModal(loginModal);
    } catch (error) {
      console.error(error);
      loginStatus.textContent = "Не удалось загрузить персональные рекомендации";
    }
  });
}

registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const city = regCityInput.value.trim();
  const style = document.getElementById("reg-trip-style").value;
  const season = document.getElementById("reg-season").value;
  const timeOfDay = regTimeOfDaySelect.value;
  const bookingClass = regClassSelect.value;
  const dowCat = regDowCatSelect.value;
  const moscowAirport = regMoscowAirportSelect.value || "any";

  if (!city || !style || !season || !timeOfDay || !bookingClass || !dowCat) {
    loginStatus.textContent = "Пожалуйста, заполните анкету полностью";
    return;
  }

  sessionPreferences = {
    city,
    originCode: mapCityToOrigin(city),
    tripStyle: style,
    season,
    timeOfDay,
    bookingClass,
    dowCat,
    moscowAirport: isMoscowCity(city) ? moscowAirport : "any",
    source: pendingScenario === "light_newbie" ? "survey_from_login" : "survey",
    userId: pendingScenario === "light_newbie" ? String(pendingLoginUserId) : "",
    preferredCabin:
      bookingClass === "any"
        ? ""
        : bookingClass.charAt(0).toUpperCase() + bookingClass.slice(1)
  };

  loginStatus.textContent = "Анкета заполнена, персональные рекомендации готовы";

  try {
    const starterRecommendations = buildStarterRecommendations(city, style);

    renderPersonalRecommendations(
      starterRecommendations,
      pendingScenario === "light_newbie"
        ? "Рекомендации после анкеты"
        : "Стартовые рекомендации по вашим предпочтениям"
    );

    closeModal(registerModal);
    registerForm.reset();
    moscowAirportGroup.classList.add("hidden");
  } catch (error) {
    console.error(error);
    loginStatus.textContent = "Не удалось построить рекомендации";
  }
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const rawValue = document.getElementById("login-user-id").value;
  const userId = String(rawValue || "").trim();
  if (!userId) return;

  loginStatus.textContent = `Проверяем пользователя ${userId}...`;

  try {
    const scenario = await getUserScenario(userId);

    sessionPreferences = {
      ...sessionPreferences,
      source: "login",
      userId,
      preferredCabin: ""
    };

    pendingLoginUserId = userId;
    lastFetchedLoginRoutes = [];

    const isLightNewbie =
      scenario &&
      (scenario.scenario === "light_newbie" || Number(scenario.total_flights || 0) <= 2);

    if (isLightNewbie) {
      pendingScenario = "light_newbie";
      loginStatus.textContent = "Для вас доступен короткий тест перед рекомендациями";
      showQuizPrompt();
      closeModal(loginModal);
      return;
    }

    pendingScenario = "existing_user";
    await renderDirectLoginRecommendations(userId);
    loginStatus.textContent = `Вошли как ${userId}. Персональные рекомендации загружены.`;
    closeModal(loginModal);
  } catch (error) {
    console.error(error);
    loginStatus.textContent = "Не удалось загрузить персональные рекомендации";
  }
});

if (sortByTimeBtn) {
  sortByTimeBtn.addEventListener("click", () => {
    if (currentFlightsToRender.length) {
      renderFlightsSorted();
    }
  });
}

async function init() {
  await loadAirportCodes();
  await loadAirportCityMap();
  await loadFlightsDetails();
  renderPopularRoutes();
}

init();