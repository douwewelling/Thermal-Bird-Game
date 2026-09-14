"""
body_tracker.py

Herbruikbare kern voor het volgen van armen en torso (polsen, ellebogen,
schouders, heupen) via een live webcam, met MediaPipe's
PoseLandmarker. Ontworpen als bouwsteen voor een motion-tracking spel: de
game-loop leest elke frame de actuele gewrichtsposities uit via `read()`
en beslist zelf wat daarmee te doen (score, botsingsdetectie, besturing...).

Gebruik:
    tracker = BodyTracker()
    tracker.start()
    while True:
        frame, joints = tracker.read()
        if frame is None:
            break
        if joints:
            left_wrist = joints["LEFT_WRIST"]
            print(left_wrist.x, left_wrist.y)
        draw_skeleton(frame, joints)
        cv2.imshow("tracker", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    tracker.stop()
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

import cv2
import mediapipe as mp

MODEL_PATH = Path(__file__).parent / "models" / "pose_landmarker_lite.task"

# De gewrichten die voor armen + torso relevant zijn: polsen, ellebogen,
# schouders, en de heup als onderkant van de torso (geen benen).
TRACKED_JOINTS = (
    "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST",
    "LEFT_HIP", "RIGHT_HIP",
)

# Botverbindingen om een skelet te tekenen (alleen tussen getrackte gewrichten).
SKELETON_EDGES = (
    ("LEFT_SHOULDER", "RIGHT_SHOULDER"),
    ("LEFT_SHOULDER", "LEFT_ELBOW"),
    ("LEFT_ELBOW", "LEFT_WRIST"),
    ("RIGHT_SHOULDER", "RIGHT_ELBOW"),
    ("RIGHT_ELBOW", "RIGHT_WRIST"),
    ("LEFT_SHOULDER", "LEFT_HIP"),
    ("RIGHT_SHOULDER", "RIGHT_HIP"),
    ("LEFT_HIP", "RIGHT_HIP"),
)


@dataclass
class Joint:
    """Positie van een gewricht, zowel genormaliseerd als in pixels."""
    x: float          # genormaliseerd 0..1 (breedte)
    y: float          # genormaliseerd 0..1 (hoogte)
    z: float          # relatieve diepte (negatief = dichter bij camera)
    visibility: float # 0..1, hoe zeker het model is dat het gewricht zichtbaar is
    px: Tuple[int, int]  # pixelcoordinaten in het huidige frame


JointMap = Dict[str, Joint]


class BodyTracker:
    """Wrapper rond MediaPipe PoseLandmarker voor live webcam-tracking."""

    def __init__(
        self,
        camera_index: int = 0,
        model_path: Path = MODEL_PATH,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        frame_width: int = 1280,
        frame_height: int = 720,
    ) -> None:
        self.camera_index = camera_index
        self.model_path = model_path
        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence
        self.frame_width = frame_width
        self.frame_height = frame_height

        self._cap: Optional[cv2.VideoCapture] = None
        self._landmarker = None
        self._start_time = 0.0

    def start(self) -> None:
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Pose-model niet gevonden op {self.model_path}. "
                "Download pose_landmarker_lite.task naar de 'models' map."
            )

        base_options = mp.tasks.BaseOptions(model_asset_path=str(self.model_path))
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=self.min_detection_confidence,
            min_tracking_confidence=self.min_tracking_confidence,
        )
        self._landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(options)

        self._cap = cv2.VideoCapture(self.camera_index)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
        if not self._cap.isOpened():
            raise RuntimeError(f"Kan webcam #{self.camera_index} niet openen.")

        self._start_time = time.time()

    def read(self) -> Tuple[Optional["cv2.Mat"], Optional[JointMap]]:
        """Leest een frame en geeft (frame, joints) terug.

        `joints` is None als er geen lichaam gedetecteerd is in dit frame.
        Geeft (None, None) terug als de camera geen frame meer levert.
        """
        assert self._cap is not None and self._landmarker is not None, "Roep start() eerst aan."

        ok, frame = self._cap.read()
        if not ok:
            return None, None

        frame = cv2.flip(frame, 1)  # spiegelen: intuitiever voor de speler
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        timestamp_ms = int((time.time() - self._start_time) * 1000)

        result = self._landmarker.detect_for_video(mp_image, timestamp_ms)

        joints: Optional[JointMap] = None
        if result.pose_landmarks:
            landmarks = result.pose_landmarks[0]
            h, w = frame.shape[:2]
            joints = {}
            for name in TRACKED_JOINTS:
                idx = mp.tasks.vision.PoseLandmark[name]
                lm = landmarks[idx]
                joints[name] = Joint(
                    x=lm.x, y=lm.y, z=lm.z, visibility=lm.visibility,
                    px=(int(lm.x * w), int(lm.y * h)),
                )

        return frame, joints

    def stop(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        if self._landmarker is not None:
            self._landmarker.close()
            self._landmarker = None

    def __enter__(self) -> "BodyTracker":
        self.start()
        return self

    def __exit__(self, *exc) -> None:
        self.stop()


def draw_skeleton(frame, joints: Optional[JointMap], visibility_threshold: float = 0.5) -> None:
    """Tekent het skelet (botten + gewrichten) op `frame` (in-place)."""
    if joints is None:
        return

    for a, b in SKELETON_EDGES:
        ja, jb = joints.get(a), joints.get(b)
        if ja and jb and ja.visibility >= visibility_threshold and jb.visibility >= visibility_threshold:
            cv2.line(frame, ja.px, jb.px, (60, 220, 60), 3)

    for name, joint in joints.items():
        if joint.visibility >= visibility_threshold:
            cv2.circle(frame, joint.px, 7, (40, 160, 255), -1)
            cv2.circle(frame, joint.px, 7, (20, 20, 20), 1)
