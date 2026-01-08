export interface FlightResponse {
  flightNumber: string;
  origin: string;
  originFull: string;
  destination: string;
  destinationFull: string;
  departureTime: string;
  price: number;
  currency: string;
}

export interface TripResponse {
  aller: FlightResponse;
  retour: FlightResponse;
  prix_total: number;
  destination_code: string;
}

export interface ScanResponse {
  resultats: TripResponse[];
  nombre_requetes: number;
  message: string;
}

export interface DateAvecHoraire {
  date: string;  // ISO date string
  heure_min?: string;  // HH:MM format
  heure_max?: string;  // HH:MM format
}

export interface Destination {
  code: string;
  nom: string;
  pays: string;
  destinationFull: string;
}

export interface ScanRequest {
  aeroport_depart?: string;  // Code IATA (ex: "BVA")
  dates_depart: DateAvecHoraire[];  // Dates avec horaires individuels
  dates_retour: DateAvecHoraire[];   // Dates avec horaires individuels
  budget_max?: number;  // Max price per segment
  limite_allers?: number;  // Nombre max d'allers à traiter (défaut: 50)
  destinations_exclues?: string[];  // Codes IATA des destinations à exclure
  destinations_incluses?: string[] | null;  // Codes IATA des destinations à inclure (si null, toutes sauf exclues)
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
}

