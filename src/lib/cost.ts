/** Surcout kilometrique du detour : l'aller-retour est penalise d'un facteur 1,3. */
export const DETOUR_FACTOR = 1.3;

export interface TripCostInput {
  pricePerLiter: number;
  distanceKm: number;
  liters: number;
  consumptionLPer100Km: number;
}

/** Arrondit un nombre a un nombre de decimales donne (au plus proche, half-up). */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const shifted = Number(`${value}e${decimals}`);
  if (!Number.isFinite(shifted)) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
  return Number(`${Math.round(shifted)}e-${decimals}`);
}

/** Cout du detour : 2 x distance x 1,3 x (consommation/100) x prix au litre. */
export function detourCost(input: TripCostInput): number {
  return (
    2 * input.distanceKm * DETOUR_FACTOR * (input.consumptionLPer100Km / 100) * input.pricePerLiter
  );
}

/** Cout total du plein : litres x prix au litre + cout du detour. */
export function totalCost(input: TripCostInput): number {
  return input.liters * input.pricePerLiter + detourCost(input);
}
