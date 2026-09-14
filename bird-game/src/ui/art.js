const FIG = {
  // [left wrist, left elbow, right elbow, right wrist] as x,y pairs; torso is fixed
  flap: [[8, 8], [20, 12], [44, 12], [56, 8]],
  glide: [[4, 24], [18, 24], [46, 24], [60, 24]],
  dive: [[22, 40], [26, 32], [38, 32], [42, 40]],
  tilt: [[6, 34], [19, 30], [45, 18], [58, 12]],
};

const ACCENT = { flap: "#ffb347", glide: "#5fd7c8", dive: "#ff6b6b", tilt: "#f7efe4" };

/** Small stick-figure diagram of each pose, drawn inline so the CSS stays simple. */
export function poseArt(kind) {
  const [lw, le, re, rw] = FIG[kind];
  const tilt = kind === "tilt" ? 10 : 0;
  const arrows =
    kind === "flap"
      ? `<path d="M12 14 v9 m0 0 l-3 -3 m3 3 l3 -3" /><path d="M52 14 v9 m0 0 l-3 -3 m3 3 l3 -3" />`
      : kind === "dive"
        ? `<path d="M32 46 v8 m0 0 l-3.5 -3.5 m3.5 3.5 l3.5 -3.5" />`
        : kind === "tilt"
          ? `<path d="M46 44 a16 16 0 0 0 -14 -8" /><path d="M32 36 l4 -3 m-4 3 l4 3" />`
          : `<path d="M8 26 h-5 m0 0 l3.5 -3 m-3.5 3 l3.5 3" /><path d="M56 26 h5 m0 0 l-3.5 -3 m3.5 3 l-3.5 3" />`;

  return `<svg viewBox="0 0 64 56" fill="none" stroke="${ACCENT[kind]}" stroke-width="2.4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g transform="rotate(${tilt} 32 30)">
      <circle cx="32" cy="14" r="4.5" />
      <path d="M32 19 v16" />
      <path d="M32 24 L${le[0]} ${le[1]} L${lw[0]} ${lw[1]}" />
      <path d="M32 24 L${re[0]} ${re[1]} L${rw[0]} ${rw[1]}" />
      <path d="M32 35 l-6 12 M32 35 l6 12" />
    </g>
    <g stroke-width="1.6" opacity="0.75">${arrows}</g>
  </svg>`;
}

export function paintPoseArt(root = document) {
  root.querySelectorAll("[data-art]").forEach((el) => {
    el.innerHTML = poseArt(el.dataset.art);
  });
}
