"""
demo.py

Live demo van de BodyTracker: toont de webcam met het skelet erover heen
getekend, een FPS-teller, en een klein voorbeeld van hoe een spel de
gewrichtsdata zou gebruiken (hier: tellen hoe vaak beide polsen boven de
schouders komen, zoals bij een "jumping jack" of een "handen omhoog"-actie).

Besturing:
    q       - afsluiten
    r       - teller resetten
"""

import time

import cv2

from body_tracker import BodyTracker, draw_skeleton


def hands_above_shoulders(joints) -> bool:
    """Voorbeeld game-trigger: zijn beide polsen boven beide schouders?"""
    if joints is None:
        return False
    try:
        return (
            joints["LEFT_WRIST"].y < joints["LEFT_SHOULDER"].y
            and joints["RIGHT_WRIST"].y < joints["RIGHT_SHOULDER"].y
        )
    except KeyError:
        return False


def main() -> None:
    tracker = BodyTracker(camera_index=0)
    tracker.start()

    prev_time = time.time()
    fps = 0.0
    rep_count = 0
    was_up = False

    print("Tracker gestart. Druk op 'q' in het videovenster om te stoppen.")

    try:
        while True:
            frame, joints = tracker.read()
            if frame is None:
                print("Geen beeld meer van de camera.")
                break

            draw_skeleton(frame, joints)

            is_up = hands_above_shoulders(joints)
            if is_up and not was_up:
                rep_count += 1
            was_up = is_up

            now = time.time()
            fps = 0.9 * fps + 0.1 * (1.0 / max(now - prev_time, 1e-6))
            prev_time = now

            cv2.putText(frame, f"FPS: {fps:.1f}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            cv2.putText(frame, f"Handen omhoog: {rep_count}", (20, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            if joints is None:
                cv2.putText(frame, "Geen lichaam gedetecteerd", (20, 120),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            cv2.imshow("Camera Tracker - druk q om te stoppen", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("r"):
                rep_count = 0
    finally:
        tracker.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
