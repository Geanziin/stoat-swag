import { contextBridge } from "electron";

if (process.platform === "linux") {
  contextBridge.executeInMainWorld({
    func: () => {
      let accountId: string | undefined;

      const originalConsoleInfo = console.info;
      console.info = (...args) => {
        for (const value of args) {
          if (
            typeof value === "object" &&
            value !== null &&
            "participant" in value &&
            typeof value.participant === "string"
          ) {
            accountId = value.participant;
          }
        }

        if (
          typeof args[0] === "string" &&
          (args[0].startsWith("client leave request") ||
            args[0].startsWith("publishing track"))
        ) {
          return originalConsoleInfo(
            ...args.map((value, index) => {
              if (index === 0 || typeof value !== "object" || value === null) {
                return value;
              }

              try {
                return JSON.stringify(value);
              } catch {
                return String(value);
              }
            }),
          );
        }

        return originalConsoleInfo(...args);
      };

      const accountTier = () => {
        if (!accountId || accountId.length < 10) return "new_user";

        const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        let timestamp = 0;
        for (const character of accountId.slice(0, 10).toUpperCase()) {
          const value = alphabet.indexOf(character);
          if (value < 0) return "new_user";
          timestamp = timestamp * 32 + value;
        }

        const newAccountDuration = 72 * 60 * 60 * 1000;
        return Date.now() - timestamp <= newAccountDuration
          ? "new_user"
          : "default";
      };

      const mediaDevices = navigator.mediaDevices;
      if (mediaDevices?.getDisplayMedia) {
        const originalGetDisplayMedia =
          mediaDevices.getDisplayMedia.bind(mediaDevices);

        Object.defineProperty(mediaDevices, "getDisplayMedia", {
          configurable: true,
          writable: true,
          async value(constraints?: DisplayMediaStreamOptions) {
            if (constraints && typeof constraints.video === "object") {
              const video = { ...constraints.video };
              const stream = await originalGetDisplayMedia(constraints);
              const track = stream.getVideoTracks()[0];
              if (track) {
                const requestedMaximum = (
                  constraint: ConstrainULong | undefined,
                  fallback: number,
                ) => {
                  if (typeof constraint === "number") return constraint;
                  if (typeof constraint?.max === "number") {
                    return constraint.max;
                  }
                  return typeof constraint?.ideal === "number"
                    ? constraint.ideal
                    : fallback;
                };

                const settings = track.getSettings();
                const sourceWidth = settings.width ?? 1280;
                const sourceHeight = settings.height ?? 720;
                const aspectRatio = sourceWidth / sourceHeight;
                const maxWidth = requestedMaximum(video.width, sourceWidth);
                const maxHeight = requestedMaximum(video.height, sourceHeight);

                let width = Math.min(sourceWidth, maxWidth);
                let height = Math.floor(width / aspectRatio);
                if (height > maxHeight) {
                  height = Math.min(sourceHeight, maxHeight);
                  width = Math.floor(height * aspectRatio);
                }

                const tier = accountTier();
                const maximumArea =
                  tier === "new_user" ? 1080 * 720 : 1280 * 720;
                const area = width * height;
                if (area > maximumArea) {
                  const scale = Math.sqrt(maximumArea / area);
                  width = Math.floor(width * scale);
                  height = Math.floor(height * scale);
                }

                await track.applyConstraints({
                  width: { max: width },
                  height: { max: height },
                });
                console.info(
                  "[Stoat Desktop] Screen share capture settings",
                  JSON.stringify({
                    tier,
                    maximumArea,
                    settings: track.getSettings(),
                  }),
                );
              }

              return stream;
            }

            return originalGetDisplayMedia(constraints);
          },
        });
      }

      const normalizeDescription = (
        description?: RTCSessionDescriptionInit,
      ) => {
        if (!description?.sdp?.includes("x-google-start-bitrate")) {
          return description;
        }

        description.sdp = description.sdp
          .split(/\r?\n/)
          .flatMap((line) => {
            if (
              !line.startsWith("a=fmtp:") ||
              !line.includes("x-google-start-bitrate")
            ) {
              return [line];
            }

            const separator = line.indexOf(" ");
            if (separator < 0) return [line];

            const parameters = line
              .slice(separator + 1)
              .split(";")
              .filter(
                (parameter) =>
                  !parameter.trim().startsWith("x-google-start-bitrate="),
              );

            return parameters.length
              ? [`${line.slice(0, separator)} ${parameters.join(";")}`]
              : [];
          })
          .join("\r\n");

        console.info(
          "[Stoat Desktop] Removed conflicting WebRTC start bitrate hint",
        );
        return description;
      };

      const patchDescriptionSetter = (
        method: "setLocalDescription" | "setRemoteDescription",
      ) => {
        const original = RTCPeerConnection.prototype[method] as (
          this: RTCPeerConnection,
          description?: RTCSessionDescriptionInit,
        ) => Promise<void>;

        Object.defineProperty(RTCPeerConnection.prototype, method, {
          configurable: true,
          writable: true,
          value(
            this: RTCPeerConnection,
            description?: RTCSessionDescriptionInit,
          ) {
            return original.call(this, normalizeDescription(description));
          },
        });
      };

      patchDescriptionSetter("setLocalDescription");
      patchDescriptionSetter("setRemoteDescription");
    },
  });
}

import "./world/config";
import "./world/window";
