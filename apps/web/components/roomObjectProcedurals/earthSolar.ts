const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function julianDate(date: Date) {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/**
 * Approximate apparent solar subpoint for teaching-scale visualization.
 * Based on standard NOAA/Meeus low-precision solar coordinates: accurate to
 * well below what a room-scale globe can display, without runtime ephemeris data.
 */
export function computeSolarSubpoint(date: Date) {
  const jd = julianDate(date);
  const daysSinceJ2000 = jd - 2451545.0;
  const centuriesSinceJ2000 = daysSinceJ2000 / 36525;

  const meanLongitude = normalizeDegrees(280.46646 + 36000.76983 * centuriesSinceJ2000);
  const meanAnomaly = normalizeDegrees(357.52911 + 35999.05029 * centuriesSinceJ2000);
  const meanAnomalyRad = meanAnomaly * DEG_TO_RAD;
  const equationOfCenter =
    (1.914602 - 0.004817 * centuriesSinceJ2000) * Math.sin(meanAnomalyRad) +
    0.019993 * Math.sin(2 * meanAnomalyRad) +
    0.000289 * Math.sin(3 * meanAnomalyRad);
  const trueLongitude = meanLongitude + equationOfCenter;
  const omega = (125.04 - 1934.136 * centuriesSinceJ2000) * DEG_TO_RAD;
  const apparentLongitude = (trueLongitude - 0.00569 - 0.00478 * Math.sin(omega)) * DEG_TO_RAD;
  const obliquity =
    (23.439291 - 0.0130042 * centuriesSinceJ2000 + 0.00256 * Math.cos(omega)) * DEG_TO_RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(apparentLongitude),
    Math.cos(apparentLongitude)
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));

  const gmst = normalizeDegrees(
    280.46061837 +
      360.98564736629 * daysSinceJ2000 +
      0.000387933 * centuriesSinceJ2000 * centuriesSinceJ2000 -
      (centuriesSinceJ2000 * centuriesSinceJ2000 * centuriesSinceJ2000) / 38710000
  );
  const longitude = normalizeDegrees(rightAscension * RAD_TO_DEG - gmst + 180) - 180;

  return {
    latitudeRad: declination,
    longitudeRad: longitude * DEG_TO_RAD
  };
}

export function solarVectorFromSubpoint(latitudeRad: number, longitudeRad: number): [number, number, number] {
  const cosLat = Math.cos(latitudeRad);
  return [
    cosLat * Math.sin(longitudeRad),
    Math.sin(latitudeRad),
    cosLat * Math.cos(longitudeRad)
  ];
}

export function daylightDotForGeoCoordinate(
  latitudeRad: number,
  longitudeRad: number,
  sunLatitudeRad: number,
  sunLongitudeRad: number
) {
  const [surfaceX, surfaceY, surfaceZ] = solarVectorFromSubpoint(latitudeRad, longitudeRad);
  const [sunX, sunY, sunZ] = solarVectorFromSubpoint(sunLatitudeRad, sunLongitudeRad);
  return surfaceX * sunX + surfaceY * sunY + surfaceZ * sunZ;
}

export function unwrapRadiansDelta(currentRad: number, previousRad: number) {
  let delta = currentRad - previousRad;
  while (delta > Math.PI) delta -= TWO_PI;
  while (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

export function spinOffsetFromUnwrappedSubsolarLongitude(unwrappedLongitudeRad: number, anchorLongitudeRad: number) {
  return (unwrappedLongitudeRad - anchorLongitudeRad) / TWO_PI;
}

export function dateWithPhysicalElapsedDay(anchorDate: Date, elapsedSeconds: number, dayPeriodSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(dayPeriodSeconds) || dayPeriodSeconds <= 0) {
    return anchorDate;
  }
  return new Date(anchorDate.getTime() + elapsedSeconds / dayPeriodSeconds * 86_400_000);
}
