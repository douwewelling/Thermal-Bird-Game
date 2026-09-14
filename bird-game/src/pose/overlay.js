import { SKELETON_EDGES, LM } from "./tracker.js";

const COLORS = {
  idle: "#f7efe4",
  flap: "#ffb347",
  glide: "#5fd7c8",
  dive: "#ff6b6b",
};

const DOTS = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
  LM.LEFT_WRIST, LM.RIGHT_WRIST,
  LM.LEFT_HIP, LM.RIGHT_HIP,
];

/** The canvas is CSS-mirrored to match the video, so landmarks are drawn as-is. */
export function drawOverlay(canvas, result, gesture) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (!result) return;

  const lm = result.landmarks;
  let color = COLORS.idle;
  if (gesture?.tracked) {
    if (gesture.flapActivity > 0.25) color = COLORS.flap;
    else if (gesture.tuck > 0.5) color = COLORS.dive;
    else if (gesture.glide > 0.4) color = COLORS.glide;
  }

  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (const [a, b] of SKELETON_EDGES) {
    if (!lm[a] || !lm[b]) continue;
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  for (const i of DOTS) {
    const p = lm[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
