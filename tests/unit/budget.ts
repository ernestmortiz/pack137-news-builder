/**
 * Time limits for the performance tests. They guard against slowdowns of 10 times or more
 * (the deep-nesting bugs took 46 s where 0.4 s is normal), not against small drift. CI runners
 * are shared and about 15% to 50% slower than a developer machine, so limits are 3 times
 * wider there. Every test that checks a limit also has `{ retry: 2 }`: a busy machine (a load of
 * about 4 once made a 2 s test take 7 s) passes on a retry, while a real slowdown fails all three
 * tries.
 */
const CI_FACTOR = 3;

export function budget(ms: number): number {
  return process.env.CI ? ms * CI_FACTOR : ms;
}
