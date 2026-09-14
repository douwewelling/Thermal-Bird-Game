import { FLIGHT } from "./flight.js";

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $("hud");
    this.score = $("score");
    this.distance = $("distance");
    this.combo = $("combo");
    this.comboValue = $("combo-value");
    this.stamina = $("stamina-fill");
    this.speed = $("speed-fill");
    this.alt = $("alt-fill");
    this.tilt = $("tilt-needle");
    this.warning = $("cam-warning");
    this.modes = {
      flap: $("mode-flap"),
      glide: $("mode-glide"),
      dive: $("mode-dive"),
    };
    this.shownScore = 0;
  }

  show(visible) {
    this.el.hidden = !visible;
  }

  reset() {
    this.shownScore = 0;
  }

  update(dt, flight, gesture, session) {
    // count the score up rather than snapping, so ring pickups register visually
    this.shownScore += (session.score - this.shownScore) * (1 - Math.exp(-dt * 9));
    if (Math.abs(session.score - this.shownScore) < 0.6) this.shownScore = session.score;
    this.score.textContent = Math.round(this.shownScore).toLocaleString();
    this.distance.innerHTML = `${Math.max(0, Math.round(session.distance))}<em>m</em>`;

    const chaining = session.combo >= 2;
    this.combo.hidden = !chaining;
    if (chaining) this.comboValue.textContent = session.combo;

    const staminaPct = flight.stamina;
    this.stamina.style.width = `${staminaPct}%`;
    this.stamina.classList.toggle("low", staminaPct < 30);

    const speedNorm = (flight.speed - FLIGHT.minSpeed) / (FLIGHT.maxSpeed - FLIGHT.minSpeed);
    this.speed.style.width = `${Math.round(speedNorm * 100)}%`;

    // height above the canyon floor, not above sea level — that is what you can hit
    const altNorm = Math.min(Math.max(session.altitude / session.ceiling, 0), 1);
    this.alt.style.width = `${Math.round(altNorm * 100)}%`;

    const steer = gesture.tracked ? gesture.steer : 0;
    this.tilt.style.transform = `translateX(${steer * 72}px) rotate(${steer * 14}deg)`;

    this.modes.flap.classList.toggle("active", gesture.flapActivity > 0.25);
    this.modes.dive.classList.toggle("active", gesture.tracked && gesture.tuck > 0.5);
    this.modes.glide.classList.toggle(
      "active",
      gesture.tracked && gesture.glide > 0.4 && gesture.tuck < 0.4,
    );

    const hint = gesture.hint || "";
    this.warning.hidden = !hint;
    if (hint) this.warning.textContent = hint;
  }
}
