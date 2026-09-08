"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { formatTutorialTime, type Tutorial } from "@/lib/guides/tutorials";
import styles from "./rawaan-guide.module.css";

export function TutorialPlayer({ tutorial, seekTo, onTimeChange }: {
  tutorial: Tutorial;
  seekTo?: { seconds: number; request: number };
  onTimeChange?: (seconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);
  const hasRequested = requested || Boolean(seekTo);
  const pendingSeek = useRef<number | null>(null);

  useEffect(() => {
    if (!seekTo) return;
    pendingSeek.current = seekTo.seconds;
    const video = videoRef.current;
    if (video && video.readyState >= 1) {
      video.currentTime = seekTo.seconds;
      pendingSeek.current = null;
      // Seeking a chapter is user initiated; a paused player remains paused.
    }
  }, [seekTo]);

  useLayoutEffect(() => {
    const video = videoRef.current;
    return () => { video?.pause(); };
  }, []);

  function retry() {
    setError(false);
    videoRef.current?.load();
  }

  return (
    <div className={styles.player}>
      <video
        aria-label={tutorial.title}
        controls={hasRequested && !error}
        height={1080}
        onError={() => setError(true)}
        onLoadedMetadata={() => {
          if (videoRef.current && pendingSeek.current !== null) {
            videoRef.current.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
        }}
        onTimeUpdate={() => onTimeChange?.(videoRef.current?.currentTime ?? 0)}
        playsInline
        poster={tutorial.poster}
        preload={hasRequested ? "metadata" : "none"}
        ref={videoRef}
        src={hasRequested ? tutorial.video : undefined}
        width={1920}
      >
        {hasRequested ? <track default kind="captions" label="English" src={tutorial.captions} srcLang="en" /> : null}
        Your browser cannot play this video. Follow the written steps below.
      </video>
      {!hasRequested && !error ? (
        <button className={styles.playOverlay} onClick={() => {
          // Commit the source once before requesting playback, within the click's
          // user activation. Reassigning src would interrupt the play promise.
          flushSync(() => setRequested(true));
          const video = videoRef.current;
          if (video) void video.play().catch(() => { /* Native controls let the user retry playback. */ });
        }} type="button">
          <span className={styles.playCircle}><Play aria-hidden="true" fill="currentColor" size={23} /></span>
          <span>Watch {tutorial.title.toLowerCase()}<small>{formatTutorialTime(tutorial.durationSeconds)} · English captions</small></span>
        </button>
      ) : null}
      {error ? <div className={styles.videoError} role="status"><p>The video could not load. You can follow all the written steps below.</p><button onClick={retry} type="button"><RotateCcw aria-hidden="true" size={15} /> Try again</button></div> : null}
    </div>
  );
}
