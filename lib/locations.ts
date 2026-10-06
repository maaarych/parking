import cameras from "../data/cameras.json";

/** Cameras enabled in the MVP (data/cameras.json; also read by analyzer/analyze.py). */
export const MVP_CAMERAS: string[] = cameras;

export type ParkingLocation = {
  id: number;
  /** Name exactly as in the source PDF (ПАРКОВКИ_1.pdf). */
  name: string;
  lat: number;
  lng: number;
};

/**
 * 30 camera-monitored street parking zones in Lviv.
 * Coordinates are approximate (geocoded from street names / intersections);
 * refine them using the camera markers on the satellite maps in the PDF
 * (extracted to public/maps/<id>.jpg).
 */
export const ALL_LOCATIONS: ParkingLocation[] = [
  { id: 1, name: "перехрестя вул. Винниченка – вул. Лисенка", lat: 49.8431, lng: 24.03601 },
  { id: 2, name: "перехрестя вул. Чорновола – вул. Вагова", lat: 49.84529, lng: 24.02531 },
  { id: 3, name: "вул. Костя Левицького", lat: 49.83012, lng: 24.04988 },
  { id: 4, name: "вул. Гавришкевича", lat: 49.84433, lng: 24.0303 },
  { id: 5, name: "вул. Герцена, 7", lat: 49.83559, lng: 24.03368 },
  { id: 6, name: "вул. Данилишина, 20", lat: 49.84411, lng: 24.02291 },
  { id: 7, name: "вул. Драгоманова, 26", lat: 49.83387, lng: 24.02965 },
  { id: 8, name: "вул. Клепарівська, 1", lat: 49.8462, lng: 24.01623 },
  { id: 9, name: "вул. Кн. Романа, 1", lat: 49.83832, lng: 24.0331 },
  { id: 10, name: "вул. Князя Романа, 11", lat: 49.83669, lng: 24.03445 },
  { id: 11, name: "перехрестя вул. Кн. Романа – Фредра", lat: 49.8375, lng: 24.0338 },
  { id: 12, name: "вул. Коперника, 3", lat: 49.83896, lng: 24.02812 },
  { id: 13, name: "вул. Коперника, 40", lat: 49.83628, lng: 24.02234 },
  { id: 14, name: "перехрестя вул. Словацького – вул. Дорошенка", lat: 49.83811, lng: 24.02355 },
  { id: 15, name: "вул. Словацького, 2", lat: 49.83763, lng: 24.02443 },
  { id: 16, name: "вул. Куліша", lat: 49.84918, lng: 24.02532 },
  { id: 17, name: "вул. Лазнева, 8", lat: 49.84583, lng: 24.02649 },
  { id: 18, name: "перехрестя вул. Леонтовича – вул. Ак. Кучера", lat: 49.84387, lng: 24.01825 },
  { id: 19, name: "вул. Б. Лепкого, 15", lat: 49.8413, lng: 24.02068 },
  { id: 20, name: "вул. Листопадового Чину", lat: 49.84051, lng: 24.02058 },
  { id: 21, name: "вул. Маєра Балабана", lat: 49.84656, lng: 24.02091 },
  { id: 22, name: "вул. Мечникова", lat: 49.83882, lng: 24.0537 },
  { id: 23, name: "вул. Нижанківського, 2", lat: 49.83736, lng: 24.03244 },
  { id: 24, name: "вул. Пекарська (НЗ камера)", lat: 49.83652, lng: 24.04577 },
  { id: 25, name: "пл. Міцкевича", lat: 49.83945, lng: 24.02982 },
  { id: 26, name: "пл. Святого Теодора", lat: 49.84728, lng: 24.02657 },
  { id: 27, name: "вул. Саксаганського, 6", lat: 49.83503, lng: 24.03254 },
  { id: 28, name: "вул. Сянська, 20", lat: 49.84594, lng: 24.02802 },
  { id: 29, name: "вул. Клепарівська на Краківський ринок", lat: 49.85233, lng: 24.01472 },
  { id: 30, name: "вул. Шолом-Алейхема", lat: 49.8436, lng: 24.02066 },
];

const mvpLocationIds = new Set(MVP_CAMERAS.map((c) => Number(c.split("-")[0])));

/** Locations shown in the app: only those that have an MVP camera. */
export const LOCATIONS: ParkingLocation[] = ALL_LOCATIONS.filter((l) => mvpLocationIds.has(l.id));
