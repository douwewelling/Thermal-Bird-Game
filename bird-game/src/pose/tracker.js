import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

export const SKELETON_EDGES = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
];

/**
 * Webcam + MediaPipe PoseLandmarker. `poll()` is cheap to call every frame:
 * it only runs inference when the video has actually advanced to a new frame.
 */
export class PoseTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.result = null;
    this.ready = false;
  }

  async loadModel() {
    const vision = await FilesetResolver.forVisionTasks("/wasm");
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options("GPU"));
      this.delegate = "GPU";
    } catch {
      // some drivers refuse the WebGL delegate; CPU is slower but always works
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options("CPU"));
      this.delegate = "CPU";
    }
  }

  /** Video inputs, once permission has been granted (labels are empty before that). */
  async listCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  async startCamera(deviceId) {
    this.stopCamera();
    // 60fps where the webcam offers it: every extra frame is an extra pose sample,
    // and tracking responsiveness is bounded by the camera, not by the renderer.
    const size = { width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 60 } };
    const video = deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: "user", ...size };

    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    await new Promise((resolve, reject) => {
      if (this.video.videoWidth > 0) return resolve();
      const timer = setTimeout(() => reject(new Error("camera-timeout")), 8000);
      this.video.addEventListener(
        "loadeddata",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    this.deviceId = this.stream.getVideoTracks()[0]?.getSettings()?.deviceId ?? deviceId;
    this.lastVideoTime = -1;
    this.ready = true;
  }

  /** Returns the latest MediaPipe result, or null if nobody has been seen yet. */
  poll(nowMs) {
    if (!this.ready || !this.landmarker) return this.result;
    if (this.video.currentTime === this.lastVideoTime) return this.result;
    this.lastVideoTime = this.video.currentTime;

    const out = this.landmarker.detectForVideo(this.video, nowMs);
    if (out?.landmarks?.length) {
      this.result = {
        landmarks: out.landmarks[0],
        world: out.worldLandmarks[0],
        stamp: nowMs,
      };
    } else {
      this.result = null;
    }
    return this.result;
  }

  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.ready = false;
  }

  stop() {
    this.stopCamera();
    this.landmarker?.close();
    this.landmarker = null;
  }
}
