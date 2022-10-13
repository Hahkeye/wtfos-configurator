/// <reference lib="webworker" />

import VideoWorkerShared from "./shared";
import { Processor } from "./processor";
import {
  Font,
  FontPack,
  TILES_PER_PAGE,
} from "./fonts";
import { OsdReader } from "./osd";
import MP4Box from "mp4box";

const MAX_DISPLAY_X = 60;
const MAX_DISPLAY_Y = 22;

export class VideoWorker {
  readonly processor: Processor;
  fontPack?: FontPack;
  osdReader?: OsdReader;

  lastOsdIndex: number = 0;

  wide: boolean = false;
  hd: boolean = false;
  outWidth?: number;
  outHeight?: number;

  osdCanvas?: OffscreenCanvas;
  osdCtx?: OffscreenCanvasRenderingContext2D;
  frameCanvas?: OffscreenCanvas;
  frameCtx?: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.processor = new Processor({
      infoReady: this.infoReady.bind(this),
      modifyFrame: this.modifyFrame.bind(this),
      progressInit: this.progressInit.bind(this),
      progressUpdate: this.progressUpdate.bind(this),
    });

    addEventListener("message", this.onMessage.bind(this)); // eslint-disable-line no-restricted-globals
  }

  infoReady(info: MP4Box.ISOFileInfo) {
    const width = info.videoTracks[0].track_width;
    const height = info.videoTracks[0].track_height;

    if (width === 1280 && height === 720) {
      this.wide = true;
    }

    if (this.osdReader!.header.config.fontWidth === 24) {
      this.hd = true;
    }

    let outWidth: number;
    let outHeight: number;
    if (this.wide || this.hd) {
      outWidth = 1280;
      outHeight = 720;
    } else {
      outWidth = width;
      outHeight = height;
    }

    this.outWidth = outWidth;
    this.outHeight = outHeight;

    this.osdCanvas = new OffscreenCanvas(
      this.osdReader!.header.config.fontWidth * this.osdReader!.header.config.charWidth,
      this.osdReader!.header.config.fontHeight * this.osdReader!.header.config.charHeight
    );
    this.osdCtx = this.osdCanvas.getContext("2d")!;

    this.frameCanvas = new OffscreenCanvas(this.outWidth!, this.outHeight!);
    this.frameCtx = this.frameCanvas.getContext("2d")!;

    this.processor.processSamples({
      width: outWidth,
      height: outHeight,
    });
  }

  modifyFrame(frame: VideoFrame, frameIndex: number): VideoFrame {
    const osdCanvas = this.osdCanvas!;
    const osdCtx = this.osdCtx!;
    const frameCanvas = this.frameCanvas!;
    const frameCtx = this.frameCtx!;

    frameCtx.fillStyle = "black";
    frameCtx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
    osdCtx.clearRect(0, 0, osdCanvas.width, osdCanvas.height);

    let frameXOffset: number;
    if (this.hd || this.wide) {
      frameXOffset = (this.outWidth! - frame.displayWidth) / 2;
    } else {
      frameXOffset = 0;
    }
    frameCtx.drawImage(frame, frameXOffset, 0);

    if (this.lastOsdIndex < this.osdReader!.frames.length - 1) {
      const nextOsdIndex = this.lastOsdIndex + 1;
      const nextOsdFrame = this.osdReader!.frames[nextOsdIndex];

      if (frameIndex >= nextOsdFrame.frameNumber) {
        this.lastOsdIndex = nextOsdIndex;
      }
    }

    const osdFrame = this.osdReader!.frames[this.lastOsdIndex];
    for (let y = 0; y < MAX_DISPLAY_Y; y++) {
      for (let x = 0; x < MAX_DISPLAY_X; x++) {
        const osdFrameIndex = y + MAX_DISPLAY_Y * x;
        const osdFrameChar = osdFrame.frameData[osdFrameIndex];

        let font: Font;
        if (this.hd) {
          font =
            osdFrameChar < TILES_PER_PAGE
              ? this.fontPack!.hd1
              : this.fontPack!.hd2;
        } else {
          font =
            osdFrameChar < TILES_PER_PAGE
              ? this.fontPack!.sd1
              : this.fontPack!.sd2;
        }

        osdCtx.drawImage(
          font.getTile(osdFrameChar % TILES_PER_PAGE),
          x * this.osdReader!.header.config.fontWidth,
          y * this.osdReader!.header.config.fontHeight
        );
      }
    }

    const osdScale = frameCanvas.height / osdCanvas.height;
    const osdWidth = osdCanvas.width * osdScale;
    const osdHeight = osdCanvas.height * osdScale;
    const osdXOffset = (frameCanvas.width - osdWidth) / 2;
    const osdYOffset = (frameCanvas.height - osdHeight) / 2;

    frameCtx.drawImage(
      osdCanvas,
      osdXOffset,
      osdYOffset,
      osdWidth,
      osdHeight
    );

    return new VideoFrame(frameCanvas as any, { timestamp: frame.timestamp! });
  }

  progressInit(expectedFrames: number) {
    postMessage({
      type: VideoWorkerShared.MessageType.PROGRESS_INIT,
      expectedFrames,
    });
  }

  progressUpdate(currentFrame?: number, preview?: ImageBitmap) {
    postMessage({
      type: VideoWorkerShared.MessageType.PROGRESS_UPDATE,
      currentFrame,
      preview,
    }, [...(preview ? [preview] : [])]);
  }

  async onMessage(event: MessageEvent<VideoWorkerShared.Message>) {
    const message = event.data;
    switch (message.type) {
      case VideoWorkerShared.MessageType.FILE_IN: {
        console.debug("Hello from the worker!");

        this.osdReader = await OsdReader.fromFile(message.osdFile);
        console.debug("Got OSD reader");

        this.fontPack = await Font.fromFiles(message.fontFiles);
        console.debug("Got font pack");

        console.debug("Starting processor...");
        this.processor.processFile(message.videoFile);
        break;
      }

      default: {
        throw new Error("Unknown message type received");
      }
    }
  }
}

new VideoWorker();
