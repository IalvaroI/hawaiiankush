// The mood an effect belongs to, for the product finder's answer icons; unknown effects have none.
const MOODS = [['calm', /relax|calm|chill|mellow/], ['energy', /energ|uplift|active/], ['happy', /happy|creative|giggl|social/], ['sleep', /sleep|tired|sedat/], ['euphoric', /euphor|arous|bliss/], ['focus', /focus|clear|alert/]]

export function moodOf(effect) {
  return MOODS.find(([, pattern]) => pattern.test(String(effect).toLowerCase()))?.[0]
}
