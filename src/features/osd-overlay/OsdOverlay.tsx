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
  onFileOut?: (buffer: ArrayBuffer) => void;
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
        if (this.callbacks?.onFileOut) {
          this.callbacks.onFileOut(message.buffer);
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

  const [inProgress, setInProgress] = React.useState(false);
  const [downloadBuffer, setDownloadBuffer] = React.useState<ArrayBuffer | null>(null);

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

          ctx!.drawImage(preview, 0, 0, canvas.width, canvas.height);

          preview.close();
        }
      },
      onProgressInit: setProgressMax,
      onFileOut: (buffer: ArrayBuffer) => {
        setInProgress(false);
        setDownloadBuffer(buffer);
      },
    });
  }, []);

  const handleConvert = async () => {
    if (downloadBuffer) {
      setDownloadBuffer(null);
    }

    setInProgress(true);
    videoManager.postMessage({
      type: VideoWorkerShared.MessageType.FILE_IN,
      fontFiles: fontFiles!,
      osdFile: osdFile!,
      videoFile: videoFile!,
    } as VideoWorkerShared.FileInMessage);
  };

  const handleDownload = async () => {
    const handle = await window.showSaveFilePicker({
      excludeAcceptAllOption: true,
      suggestedName: videoFile!.name.replace(/\.[^/.]+$/, "") + "-osd.mp4",
      types: [
        {
          description: "MP4",
          accept: { "video/mp4": [".mp4"] },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(downloadBuffer!);
    await writable.close();
  };

  const convertEnabled = videoFile && osdFile && fontFiles?.length && !inProgress;
  const progressValue = progressMax ? (progress / progressMax) * 100 : 0;

  return (
    <Container fixed sx={{ paddingBottom: 3 }}>
      <Header />

      <Stack component="form" spacing={2}>
        <Alert severity="info">
          OSD recording is an opt-in feature on the goggle side.
          <pre style={{ marginBottom: 0 }}>
            $ package-config set msp-osd rec_enabled true<br />
            $ package-config apply msp-osd
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
          disabled={!convertEnabled}
          onClick={handleConvert}
          variant="contained"
        >
          Convert
        </Button>

        <Button
          color="secondary"
          disabled={!downloadBuffer}
          onClick={handleDownload}
          variant="contained"
        >
          Download
        </Button>
      </Stack>
    </Container>
  );
}
