// Whether Biscuit says hello now: once per load, when the ear is on, and only when nothing has been said yet. A page that
// speaks at mount (the mail chime, a letter's title) has the floor; a hello on top of it would cut its words short.
export function shouldGreet({ greeted, earOn, spoke }) {
  return !greeted && earOn && !spoke;
}
