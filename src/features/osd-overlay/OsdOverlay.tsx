import React from "react";

import VideoWorkerShared from "./video-worker/shared";

import Container from "@mui/material/Container";
import Header from "../navigation/Header";
import {
  Alert, Button, LinearProgress, Stack, TextField,
} from "@mui/material";

interface VideoWorkerManagerCallbacks {
  onProgress: (progress?: number, preview?: ImageBitmap) => void;
  onProgressInit: (progressMax: number) => void;
  onFileOut?: () => void;
}

class VideoWorkerManager {
  callbacks?: VideoWorkerManagerCallbacks;
  worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("./video-worker/worker", import.meta.url),
      { type: "module" }
    );
    this.worker.onmessage = this.onMessage.bind(this);
  }

  setCallbacks(callbacks: VideoWorkerManagerCallbacks) {
    this.callbacks = callbacks;
  }

  onMessage(event: MessageEvent) {
    const message = event.data as VideoWorkerShared.Message;

    switch (message.type) {
      case VideoWorkerShared.MessageType.FILE_OUT: {
        const a = document.createElement("a");
        a.href = message.blobString;
        a.download = "output.mp4";
        a.click();
        URL.revokeObjectURL(message.blobString);

        if (this.callbacks?.onFileOut) {
          this.callbacks.onFileOut();
        }

        break;
      }

      case VideoWorkerShared.MessageType.PROGRESS_INIT: {
        this.callbacks?.onProgressInit(message.expectedFrames);
        break;
      }

      case VideoWorkerShared.MessageType.PROGRESS_UPDATE: {
        this.callbacks?.onProgress(message.currentFrame, message.preview);
        break;
      }

      default: {
        throw new Error("Unknown message type received");
      }
    }
  }

  postMessage(message: VideoWorkerShared.Message) {
    this.worker.postMessage(message);
  }
}

const videoManager = new VideoWorkerManager();

export default function OsdOverlay() {
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [osdFile, setOsdFile] = React.useState<File | null>(null);
  const [fontFiles, setFontFiles] = React.useState<File[] | null>(null);

  const [progress, setProgress] = React.useState(0);
  const [progressMax, setProgressMax] = React.useState(0);

  React.useEffect(() => {
    const canvas = document.getElementById("preview") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;

    videoManager.setCallbacks({
      onProgress: (progress?: number, preview?: ImageBitmap) => {
        if (progress) {
          setProgress(progress);
        }

        if (preview) {
          if (preview.width === 1280) {
            canvas.width = 853;
          } else {
            canvas.width = 640;
          }

          const aspectRatio = preview.width / preview.height;
          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const canvasAspectRatio = canvasWidth / canvasHeight;
          if (aspectRatio > canvasAspectRatio) {
            const newWidth = canvasHeight * aspectRatio;
            const offset = (canvasWidth - newWidth) / 2;
            ctx?.drawImage(preview, offset, 0, newWidth, canvasHeight);
          } else {
            const newHeight = canvasWidth / aspectRatio;
            const offset = (canvasHeight - newHeight) / 2;
            ctx?.drawImage(preview, 0, offset, canvasWidth, newHeight);
          }

          preview.close();
        }
      },
      onProgressInit: setProgressMax,
    });
  });

  const handleConvert = async () => {
    videoManager.postMessage({
      type: VideoWorkerShared.MessageType.FILE_IN,
      fontFiles: fontFiles!,
      osdFile: osdFile!,
      videoFile: videoFile!,
    } as VideoWorkerShared.FileInMessage);
  };

  const convertEnabled = videoFile && osdFile && fontFiles?.length;
  const progressValue = progressMax ? (progress / progressMax) * 100 : 0;

  return (
    <Container fixed sx={{ paddingBottom: 3 }}>
      <Header />

      <Stack component="form" spacing={2}>
        <Alert severity="info">
          OSD recording is an opt-in feature.
          <pre style={{ marginBottom: 0 }}>
            $ package-config set msp-osd rec_enabled true
          </pre>
        </Alert>

        <canvas
          width="640"
          height="480"
          id="preview"
          style={{
            display: "block",
            backgroundColor: "black",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />

        <LinearProgress variant="determinate" value={progressValue} />

        <TextField
          id="videoFile"
          InputLabelProps={{ shrink: true }}
          inputProps={{ accept: ".mp4,video/mp4" }}
          label="Video File (.mp4)"
          onChange={(e: any) => setVideoFile(e.target.files![0])}
          type="file"
          variant="filled"
        />
        <TextField
          id="osdFile"
          InputLabelProps={{ shrink: true }}
          inputProps={{ accept: ".osd" }}
          label="OSD File (.osd)"
          onChange={(e: any) => setOsdFile(e.target.files![0])}
          type="file"
          variant="filled"
        />
        <TextField
          id="fontFiles"
          InputLabelProps={{ shrink: true }}
          inputProps={{
            accept: ".bin",
            multiple: true,
          }}
          label="Fonts (4x .bin)"
          onChange={(e: any) => setFontFiles([...e.target.files!])}
          type="file"
          variant="filled"
        />

        <Button
          onClick={handleConvert}
          disabled={!convertEnabled}
          variant="contained"
        >
          Convert
        </Button>
      </Stack>
    </Container>
  );
}
